;; title: Creator Royalty & Revenue Split Engine
;; version: 1.0.0
;; summary: Automated revenue splitting for content creators
;; description: A smart contract that enables content creators to define revenue splits
;;              and automatically distribute payments without middleman disputes.
;;              Perfect for music labels, film projects, and digital publishers.

;; traits
;;

;; token definitions
;;

;; constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-PROJECT-NOT-FOUND (err u101))
(define-constant ERR-INVALID-SPLITS (err u102))
(define-constant ERR-PROJECT-EXISTS (err u103))
(define-constant ERR-NO-RECIPIENTS (err u104))
(define-constant ERR-INVALID-AMOUNT (err u105))
(define-constant ERR-RECIPIENT-NOT-FOUND (err u106))
(define-constant ERR-MAX-RECIPIENTS (err u107))
(define-constant MAX-RECIPIENTS u10)
(define-constant BASIS-POINTS u10000) ;; 100% = 10000 basis points

;; Index list for fold operations (0-9 for max 10 recipients)
(define-constant INDEX-LIST (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9))

;; data vars
(define-data-var project-nonce uint u0)

;; Temporary storage for fold operations
(define-data-var temp-project-id uint u0)
(define-data-var temp-amount uint u0)
(define-data-var temp-recipient-count uint u0)

;; data maps

;; Project metadata
(define-map projects
  { project-id: uint }
  {
    owner: principal,
    name: (string-ascii 64),
    description: (string-ascii 256),
    total-received: uint,
    total-distributed: uint,
    active: bool,
    created-at: uint
  }
)

;; Revenue split recipients for each project
(define-map project-recipients
  { project-id: uint, index: uint }
  {
    recipient: principal,
    share: uint,  ;; in basis points (100 = 1%)
    name: (string-ascii 64),
    total-earned: uint
  }
)

;; Number of recipients per project
(define-map project-recipient-count
  { project-id: uint }
  { count: uint }
)

;; Track pending withdrawals per recipient per project
(define-map pending-withdrawals
  { project-id: uint, recipient: principal }
  { amount: uint }
)

;; public functions

;; Create a new project with revenue split configuration
(define-public (create-project
    (name (string-ascii 64))
    (description (string-ascii 256)))
  (let
    (
      (new-id (+ (var-get project-nonce) u1))
    )
    (map-set projects
      { project-id: new-id }
      {
        owner: tx-sender,
        name: name,
        description: description,
        total-received: u0,
        total-distributed: u0,
        active: true,
        created-at: stacks-block-height
      }
    )
    (map-set project-recipient-count
      { project-id: new-id }
      { count: u0 }
    )
    (var-set project-nonce new-id)
    (ok new-id)
  )
)

;; Add a recipient to a project's revenue split
(define-public (add-recipient
    (project-id uint)
    (recipient principal)
    (share uint)
    (name (string-ascii 64)))
  (let
    (
      (project (unwrap! (map-get? projects { project-id: project-id }) ERR-PROJECT-NOT-FOUND))
      (current-count (default-to { count: u0 } (map-get? project-recipient-count { project-id: project-id })))
      (new-index (get count current-count))
    )
    ;; Only project owner can add recipients
    (asserts! (is-eq tx-sender (get owner project)) ERR-NOT-AUTHORIZED)
    ;; Check max recipients limit
    (asserts! (< new-index MAX-RECIPIENTS) ERR-MAX-RECIPIENTS)
    ;; Share must be valid (1-10000 basis points)
    (asserts! (and (> share u0) (<= share BASIS-POINTS)) ERR-INVALID-SPLITS)

    (map-set project-recipients
      { project-id: project-id, index: new-index }
      {
        recipient: recipient,
        share: share,
        name: name,
        total-earned: u0
      }
    )
    (map-set project-recipient-count
      { project-id: project-id }
      { count: (+ new-index u1) }
    )
    (map-set pending-withdrawals
      { project-id: project-id, recipient: recipient }
      { amount: u0 }
    )
    (ok new-index)
  )
)

;; Pay into a project - automatically splits and credits recipients
(define-public (pay-project (project-id uint) (amount uint))
  (let
    (
      (project (unwrap! (map-get? projects { project-id: project-id }) ERR-PROJECT-NOT-FOUND))
      (recipient-count (get count (default-to { count: u0 } (map-get? project-recipient-count { project-id: project-id }))))
    )
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (get active project) ERR-PROJECT-NOT-FOUND)
    (asserts! (> recipient-count u0) ERR-NO-RECIPIENTS)

    ;; Transfer STX to contract
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))

    ;; Update project totals
    (map-set projects
      { project-id: project-id }
      (merge project { total-received: (+ (get total-received project) amount) })
    )

    ;; Set temp vars for fold operation
    (var-set temp-project-id project-id)
    (var-set temp-amount amount)
    (var-set temp-recipient-count recipient-count)

    ;; Distribute to all recipients using fold
    (fold distribute-to-recipient INDEX-LIST true)
    (ok true)
  )
)

;; Withdraw pending earnings
(define-public (withdraw (project-id uint))
  (let
    (
      (recipient tx-sender)
      (pending (unwrap! (map-get? pending-withdrawals { project-id: project-id, recipient: tx-sender }) ERR-RECIPIENT-NOT-FOUND))
      (amount (get amount pending))
      (project (unwrap! (map-get? projects { project-id: project-id }) ERR-PROJECT-NOT-FOUND))
    )
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)

    ;; Reset pending amount
    (map-set pending-withdrawals
      { project-id: project-id, recipient: tx-sender }
      { amount: u0 }
    )

    ;; Update project distributed total
    (map-set projects
      { project-id: project-id }
      (merge project { total-distributed: (+ (get total-distributed project) amount) })
    )

    ;; Transfer STX to recipient
    (as-contract (stx-transfer? amount tx-sender recipient))
  )
)

;; Deactivate a project (owner only)
(define-public (deactivate-project (project-id uint))
  (let
    (
      (project (unwrap! (map-get? projects { project-id: project-id }) ERR-PROJECT-NOT-FOUND))
    )
    (asserts! (is-eq tx-sender (get owner project)) ERR-NOT-AUTHORIZED)
    (map-set projects
      { project-id: project-id }
      (merge project { active: false })
    )
    (ok true)
  )
)

;; Update recipient share (owner only)
(define-public (update-recipient-share (project-id uint) (index uint) (new-share uint))
  (let
    (
      (project (unwrap! (map-get? projects { project-id: project-id }) ERR-PROJECT-NOT-FOUND))
      (recipient-data (unwrap! (map-get? project-recipients { project-id: project-id, index: index }) ERR-RECIPIENT-NOT-FOUND))
    )
    (asserts! (is-eq tx-sender (get owner project)) ERR-NOT-AUTHORIZED)
    (asserts! (and (> new-share u0) (<= new-share BASIS-POINTS)) ERR-INVALID-SPLITS)

    (map-set project-recipients
      { project-id: project-id, index: index }
      (merge recipient-data { share: new-share })
    )
    (ok true)
  )
)

;; read only functions

;; Get project details
(define-read-only (get-project (project-id uint))
  (map-get? projects { project-id: project-id })
)

;; Get recipient at index
(define-read-only (get-recipient (project-id uint) (index uint))
  (map-get? project-recipients { project-id: project-id, index: index })
)

;; Get recipient count for a project
(define-read-only (get-recipient-count (project-id uint))
  (default-to { count: u0 } (map-get? project-recipient-count { project-id: project-id }))
)

;; Get pending withdrawal amount for a recipient
(define-read-only (get-pending-withdrawal (project-id uint) (recipient principal))
  (default-to { amount: u0 } (map-get? pending-withdrawals { project-id: project-id, recipient: recipient }))
)

;; Get total projects created
(define-read-only (get-project-count)
  (var-get project-nonce)
)

;; Calculate split amount for a given payment
(define-read-only (calculate-split (amount uint) (share uint))
  (/ (* amount share) BASIS-POINTS)
)

;; Validate total shares equal 100% (10000 basis points)
(define-read-only (validate-splits (project-id uint))
  (let
    (
      (recipient-count (get count (get-recipient-count project-id)))
    )
    (fold sum-share-at-index INDEX-LIST { project-id: project-id, count: recipient-count, total: u0 })
  )
)

;; private functions

;; Distribute payment to a single recipient (used with fold)
(define-private (distribute-to-recipient (index uint) (previous-result bool))
  (let
    (
      (project-id (var-get temp-project-id))
      (amount (var-get temp-amount))
      (recipient-count (var-get temp-recipient-count))
    )
    (if (and previous-result (< index recipient-count))
      (match (map-get? project-recipients { project-id: project-id, index: index })
        recipient-data
        (let
          (
            (recipient (get recipient recipient-data))
            (share (get share recipient-data))
            (split-amount (calculate-split amount share))
            (current-pending (get amount (default-to { amount: u0 } (map-get? pending-withdrawals { project-id: project-id, recipient: recipient }))))
          )
          ;; Update pending withdrawal
          (map-set pending-withdrawals
            { project-id: project-id, recipient: recipient }
            { amount: (+ current-pending split-amount) }
          )
          ;; Update recipient total earned
          (map-set project-recipients
            { project-id: project-id, index: index }
            (merge recipient-data { total-earned: (+ (get total-earned recipient-data) split-amount) })
          )
          true
        )
        previous-result
      )
      previous-result
    )
  )
)

;; Sum share at a specific index (used with fold)
(define-private (sum-share-at-index (index uint) (state { project-id: uint, count: uint, total: uint }))
  (let
    (
      (project-id (get project-id state))
      (count (get count state))
      (running-total (get total state))
    )
    (if (< index count)
      (let
        (
          (recipient-data (map-get? project-recipients { project-id: project-id, index: index }))
          (share (default-to u0 (get share recipient-data)))
        )
        { project-id: project-id, count: count, total: (+ running-total share) }
      )
      state
    )
  )
)
