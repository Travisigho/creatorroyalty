import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

// Error constants matching the contract
const ERR_NOT_AUTHORIZED = 100;
const ERR_PROJECT_NOT_FOUND = 101;
const ERR_INVALID_SPLITS = 102;
const ERR_NO_RECIPIENTS = 104;
const ERR_INVALID_AMOUNT = 105;
const ERR_RECIPIENT_NOT_FOUND = 106;
const ERR_MAX_RECIPIENTS = 107;

describe("Creator Royalty & Revenue Split Engine", () => {

  // ============================================================
  // create-project
  // ============================================================
  describe("create-project", () => {
    it("creates a project and returns project id u1", () => {
      const { result } = simnet.callPublicFn(
        "royalty",
        "create-project",
        [Cl.stringAscii("Summer Album"), Cl.stringAscii("A collaborative EP")],
        deployer
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("increments project id on each creation", () => {
      simnet.callPublicFn("royalty", "create-project", [Cl.stringAscii("Project A"), Cl.stringAscii("Desc A")], deployer);
      const { result } = simnet.callPublicFn("royalty", "create-project", [Cl.stringAscii("Project B"), Cl.stringAscii("Desc B")], deployer);
      expect(result).toBeOk(Cl.uint(2));
    });

    it("stores project with correct owner and active status", () => {
      simnet.callPublicFn("royalty", "create-project", [Cl.stringAscii("My Film"), Cl.stringAscii("Film project")], deployer);
      const { result } = simnet.callReadOnlyFn("royalty", "get-project", [Cl.uint(1)], deployer);
      expect(result).toBeSome(
        Cl.tuple({
          owner: Cl.principal(deployer),
          name: Cl.stringAscii("My Film"),
          description: Cl.stringAscii("Film project"),
          "total-received": Cl.uint(0),
          "total-distributed": Cl.uint(0),
          active: Cl.bool(true),
          "created-at": Cl.uint(simnet.blockHeight),
        })
      );
    });
  });

  // ============================================================
  // add-recipient
  // ============================================================
  describe("add-recipient", () => {
    beforeEach(() => {
      simnet.callPublicFn("royalty", "create-project", [Cl.stringAscii("Album"), Cl.stringAscii("Desc")], deployer);
    });

    it("adds a recipient and returns index u0", () => {
      const { result } = simnet.callPublicFn(
        "royalty",
        "add-recipient",
        [Cl.uint(1), Cl.principal(wallet1), Cl.uint(5000), Cl.stringAscii("Artist")],
        deployer
      );
      expect(result).toBeOk(Cl.uint(0));
    });

    it("adds multiple recipients and increments index", () => {
      simnet.callPublicFn("royalty", "add-recipient", [Cl.uint(1), Cl.principal(wallet1), Cl.uint(5000), Cl.stringAscii("Artist")], deployer);
      const { result } = simnet.callPublicFn(
        "royalty",
        "add-recipient",
        [Cl.uint(1), Cl.principal(wallet2), Cl.uint(3000), Cl.stringAscii("Producer")],
        deployer
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("fails if caller is not project owner", () => {
      const { result } = simnet.callPublicFn(
        "royalty",
        "add-recipient",
        [Cl.uint(1), Cl.principal(wallet2), Cl.uint(5000), Cl.stringAscii("Artist")],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it("fails if project does not exist", () => {
      const { result } = simnet.callPublicFn(
        "royalty",
        "add-recipient",
        [Cl.uint(99), Cl.principal(wallet1), Cl.uint(5000), Cl.stringAscii("Artist")],
        deployer
      );
      expect(result).toBeErr(Cl.uint(ERR_PROJECT_NOT_FOUND));
    });

    it("fails if share is 0", () => {
      const { result } = simnet.callPublicFn(
        "royalty",
        "add-recipient",
        [Cl.uint(1), Cl.principal(wallet1), Cl.uint(0), Cl.stringAscii("Artist")],
        deployer
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_SPLITS));
    });

    it("fails if share exceeds 10000 basis points", () => {
      const { result } = simnet.callPublicFn(
        "royalty",
        "add-recipient",
        [Cl.uint(1), Cl.principal(wallet1), Cl.uint(10001), Cl.stringAscii("Artist")],
        deployer
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_SPLITS));
    });
  });

  // ============================================================
  // pay-project
  // ============================================================
  describe("pay-project", () => {
    beforeEach(() => {
      simnet.callPublicFn("royalty", "create-project", [Cl.stringAscii("Album"), Cl.stringAscii("Desc")], deployer);
      simnet.callPublicFn("royalty", "add-recipient", [Cl.uint(1), Cl.principal(wallet1), Cl.uint(5000), Cl.stringAscii("Artist")], deployer);
      simnet.callPublicFn("royalty", "add-recipient", [Cl.uint(1), Cl.principal(wallet2), Cl.uint(3000), Cl.stringAscii("Producer")], deployer);
      simnet.callPublicFn("royalty", "add-recipient", [Cl.uint(1), Cl.principal(wallet3), Cl.uint(2000), Cl.stringAscii("Label")], deployer);
    });

    it("pays into project and returns ok true", () => {
      const { result } = simnet.callPublicFn(
        "royalty",
        "pay-project",
        [Cl.uint(1), Cl.uint(1000000)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("correctly credits 50% to wallet1 after payment", () => {
      simnet.callPublicFn("royalty", "pay-project", [Cl.uint(1), Cl.uint(1000000)], deployer);
      const { result } = simnet.callReadOnlyFn(
        "royalty",
        "get-pending-withdrawal",
        [Cl.uint(1), Cl.principal(wallet1)],
        deployer
      );
      expect(result).toBeTuple({ amount: Cl.uint(500000) });
    });

    it("correctly credits 30% to wallet2 after payment", () => {
      simnet.callPublicFn("royalty", "pay-project", [Cl.uint(1), Cl.uint(1000000)], deployer);
      const { result } = simnet.callReadOnlyFn(
        "royalty",
        "get-pending-withdrawal",
        [Cl.uint(1), Cl.principal(wallet2)],
        deployer
      );
      expect(result).toBeTuple({ amount: Cl.uint(300000) });
    });

    it("correctly credits 20% to wallet3 after payment", () => {
      simnet.callPublicFn("royalty", "pay-project", [Cl.uint(1), Cl.uint(1000000)], deployer);
      const { result } = simnet.callReadOnlyFn(
        "royalty",
        "get-pending-withdrawal",
        [Cl.uint(1), Cl.principal(wallet3)],
        deployer
      );
      expect(result).toBeTuple({ amount: Cl.uint(200000) });
    });

    it("accumulates earnings across multiple payments", () => {
      simnet.callPublicFn("royalty", "pay-project", [Cl.uint(1), Cl.uint(1000000)], deployer);
      simnet.callPublicFn("royalty", "pay-project", [Cl.uint(1), Cl.uint(1000000)], deployer);
      const { result } = simnet.callReadOnlyFn(
        "royalty",
        "get-pending-withdrawal",
        [Cl.uint(1), Cl.principal(wallet1)],
        deployer
      );
      expect(result).toBeTuple({ amount: Cl.uint(1000000) });
    });

    it("updates project total-received after payment", () => {
      simnet.callPublicFn("royalty", "pay-project", [Cl.uint(1), Cl.uint(1000000)], deployer);
      const { result } = simnet.callReadOnlyFn("royalty", "get-project", [Cl.uint(1)], deployer);
      const tupleValue = (result as any).value.value;
      expect(tupleValue["total-received"]).toEqual(Cl.uint(1000000));
    });

    it("fails if amount is 0", () => {
      const { result } = simnet.callPublicFn("royalty", "pay-project", [Cl.uint(1), Cl.uint(0)], deployer);
      expect(result).toBeErr(Cl.uint(ERR_INVALID_AMOUNT));
    });

    it("fails if project has no recipients", () => {
      simnet.callPublicFn("royalty", "create-project", [Cl.stringAscii("Empty Project"), Cl.stringAscii("No recipients")], deployer);
      const { result } = simnet.callPublicFn("royalty", "pay-project", [Cl.uint(2), Cl.uint(1000000)], deployer);
      expect(result).toBeErr(Cl.uint(ERR_NO_RECIPIENTS));
    });

    it("fails if project does not exist", () => {
      const { result } = simnet.callPublicFn("royalty", "pay-project", [Cl.uint(99), Cl.uint(1000000)], deployer);
      expect(result).toBeErr(Cl.uint(ERR_PROJECT_NOT_FOUND));
    });
  });

  // ============================================================
  // withdraw
  // ============================================================
  describe("withdraw", () => {
    beforeEach(() => {
      simnet.callPublicFn("royalty", "create-project", [Cl.stringAscii("Album"), Cl.stringAscii("Desc")], deployer);
      simnet.callPublicFn("royalty", "add-recipient", [Cl.uint(1), Cl.principal(wallet1), Cl.uint(5000), Cl.stringAscii("Artist")], deployer);
      simnet.callPublicFn("royalty", "add-recipient", [Cl.uint(1), Cl.principal(wallet2), Cl.uint(5000), Cl.stringAscii("Producer")], deployer);
      simnet.callPublicFn("royalty", "pay-project", [Cl.uint(1), Cl.uint(1000000)], deployer);
    });

    it("clears pending withdrawal after withdraw", () => {
      simnet.callPublicFn("royalty", "withdraw", [Cl.uint(1)], wallet1);
      const { result } = simnet.callReadOnlyFn(
        "royalty",
        "get-pending-withdrawal",
        [Cl.uint(1), Cl.principal(wallet1)],
        deployer
      );
      expect(result).toBeTuple({ amount: Cl.uint(0) });
    });

    it("updates project total-distributed after withdraw", () => {
      simnet.callPublicFn("royalty", "withdraw", [Cl.uint(1)], wallet1);
      const { result } = simnet.callReadOnlyFn("royalty", "get-project", [Cl.uint(1)], deployer);
      const tupleValue = (result as any).value.value;
      expect(tupleValue["total-distributed"]).toEqual(Cl.uint(500000));
    });

    it("fails if no pending withdrawal", () => {
      simnet.callPublicFn("royalty", "withdraw", [Cl.uint(1)], wallet1);
      const { result } = simnet.callPublicFn("royalty", "withdraw", [Cl.uint(1)], wallet1);
      expect(result).toBeErr(Cl.uint(ERR_INVALID_AMOUNT));
    });

    it("fails if recipient has no record in project", () => {
      const { result } = simnet.callPublicFn("royalty", "withdraw", [Cl.uint(1)], wallet3);
      expect(result).toBeErr(Cl.uint(ERR_RECIPIENT_NOT_FOUND));
    });
  });

  // ============================================================
  // deactivate-project
  // ============================================================
  describe("deactivate-project", () => {
    beforeEach(() => {
      simnet.callPublicFn("royalty", "create-project", [Cl.stringAscii("Album"), Cl.stringAscii("Desc")], deployer);
      simnet.callPublicFn("royalty", "add-recipient", [Cl.uint(1), Cl.principal(wallet1), Cl.uint(10000), Cl.stringAscii("Artist")], deployer);
    });

    it("deactivates project successfully", () => {
      const { result } = simnet.callPublicFn("royalty", "deactivate-project", [Cl.uint(1)], deployer);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("sets project active to false", () => {
      simnet.callPublicFn("royalty", "deactivate-project", [Cl.uint(1)], deployer);
      const { result } = simnet.callReadOnlyFn("royalty", "get-project", [Cl.uint(1)], deployer);
      const tupleValue = (result as any).value.value;
      expect(tupleValue["active"]).toEqual(Cl.bool(false));
    });

    it("prevents payments to deactivated project", () => {
      simnet.callPublicFn("royalty", "deactivate-project", [Cl.uint(1)], deployer);
      const { result } = simnet.callPublicFn("royalty", "pay-project", [Cl.uint(1), Cl.uint(1000000)], deployer);
      expect(result).toBeErr(Cl.uint(ERR_PROJECT_NOT_FOUND));
    });

    it("fails if caller is not owner", () => {
      const { result } = simnet.callPublicFn("royalty", "deactivate-project", [Cl.uint(1)], wallet1);
      expect(result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });
  });

  // ============================================================
  // update-recipient-share
  // ============================================================
  describe("update-recipient-share", () => {
    beforeEach(() => {
      simnet.callPublicFn("royalty", "create-project", [Cl.stringAscii("Album"), Cl.stringAscii("Desc")], deployer);
      simnet.callPublicFn("royalty", "add-recipient", [Cl.uint(1), Cl.principal(wallet1), Cl.uint(5000), Cl.stringAscii("Artist")], deployer);
    });

    it("updates recipient share successfully", () => {
      const { result } = simnet.callPublicFn(
        "royalty",
        "update-recipient-share",
        [Cl.uint(1), Cl.uint(0), Cl.uint(7000)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("stores the new share value", () => {
      simnet.callPublicFn("royalty", "update-recipient-share", [Cl.uint(1), Cl.uint(0), Cl.uint(7000)], deployer);
      const { result } = simnet.callReadOnlyFn("royalty", "get-recipient", [Cl.uint(1), Cl.uint(0)], deployer);
      const tupleValue = (result as any).value.value;
      expect(tupleValue["share"]).toEqual(Cl.uint(7000));
    });

    it("fails if caller is not owner", () => {
      const { result } = simnet.callPublicFn(
        "royalty",
        "update-recipient-share",
        [Cl.uint(1), Cl.uint(0), Cl.uint(7000)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    });

    it("fails if new share is 0", () => {
      const { result } = simnet.callPublicFn(
        "royalty",
        "update-recipient-share",
        [Cl.uint(1), Cl.uint(0), Cl.uint(0)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_SPLITS));
    });
  });

  // ============================================================
  // read-only functions
  // ============================================================
  describe("read-only functions", () => {
    beforeEach(() => {
      simnet.callPublicFn("royalty", "create-project", [Cl.stringAscii("Album"), Cl.stringAscii("Desc")], deployer);
      simnet.callPublicFn("royalty", "add-recipient", [Cl.uint(1), Cl.principal(wallet1), Cl.uint(6000), Cl.stringAscii("Artist")], deployer);
      simnet.callPublicFn("royalty", "add-recipient", [Cl.uint(1), Cl.principal(wallet2), Cl.uint(4000), Cl.stringAscii("Producer")], deployer);
    });

    it("get-project-count returns correct count", () => {
      const { result } = simnet.callReadOnlyFn("royalty", "get-project-count", [], deployer);
      expect(result).toBeUint(1);
    });

    it("get-recipient-count returns correct count", () => {
      const { result } = simnet.callReadOnlyFn("royalty", "get-recipient-count", [Cl.uint(1)], deployer);
      expect(result).toBeTuple({ count: Cl.uint(2) });
    });

    it("calculate-split returns correct amount", () => {
      // 50% of 1000000 = 500000
      const { result } = simnet.callReadOnlyFn(
        "royalty",
        "calculate-split",
        [Cl.uint(1000000), Cl.uint(5000)],
        deployer
      );
      expect(result).toBeUint(500000);
    });

    it("validate-splits sums all shares correctly", () => {
      const { result } = simnet.callReadOnlyFn("royalty", "validate-splits", [Cl.uint(1)], deployer);
      // 6000 + 4000 = 10000 (100%)
      expect(result).toBeTuple({ "project-id": Cl.uint(1), count: Cl.uint(2), total: Cl.uint(10000) });
    });

    it("get-project returns none for non-existent project", () => {
      const { result } = simnet.callReadOnlyFn("royalty", "get-project", [Cl.uint(99)], deployer);
      expect(result).toBeNone();
    });

    it("get-recipient returns none for non-existent index", () => {
      const { result } = simnet.callReadOnlyFn("royalty", "get-recipient", [Cl.uint(1), Cl.uint(99)], deployer);
      expect(result).toBeNone();
    });
  });
});
