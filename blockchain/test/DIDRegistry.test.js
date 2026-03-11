const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DIDRegistry", function () {
  async function deployFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();
    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    const didRegistry = await DIDRegistry.deploy();
    return { didRegistry, owner, user1, user2, user3 };
  }

  async function deployWithDIDFixture() {
    const { didRegistry, owner, user1, user2, user3 } = await loadFixture(deployFixture);
    const didId = "did:vault:user1";
    const serviceEndpoint = "https://user1.example.com";
    await didRegistry.connect(user1).createDID(didId, serviceEndpoint);
    return { didRegistry, owner, user1, user2, user3, didId, serviceEndpoint };
  }

  // =========================================================================
  // createDID
  // =========================================================================

  describe("createDID", function () {
    it("should create a DID with correct document fields", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);
      const didId = "did:vault:123";
      const serviceEndpoint = "https://example.com";

      await didRegistry.connect(user1).createDID(didId, serviceEndpoint);

      const doc = await didRegistry.getDIDDocument(didId);
      expect(doc.controller).to.equal(user1.address);
      expect(doc.serviceEndpoint).to.equal(serviceEndpoint);
      expect(doc.active).to.be.true;
      expect(doc.created).to.be.greaterThan(0);
      expect(doc.updated).to.equal(doc.created);
    });

    it("should set didExists to true", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);
      const didId = "did:vault:check";

      expect(await didRegistry.didExists(didId)).to.be.false;
      await didRegistry.connect(user1).createDID(didId, "ep");
      expect(await didRegistry.didExists(didId)).to.be.true;
    });

    it("should auto-add controller as authentication key", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);
      const didId = "did:vault:autokey";

      await didRegistry.connect(user1).createDID(didId, "ep");

      const keys = await didRegistry.getKeys(didId);
      expect(keys.length).to.equal(1);
      expect(keys[0].keyAddress).to.equal(user1.address);
      expect(keys[0].keyType).to.equal(0); // Authentication
      expect(keys[0].active).to.be.true;
    });

    it("should set reverse lookup", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);
      const didId = "did:vault:reverse";

      await didRegistry.connect(user1).createDID(didId, "ep");

      expect(await didRegistry.resolveDID(user1.address)).to.equal(didId);
    });

    it("should emit DIDCreated and KeyAdded events", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);
      const didId = "did:vault:events";

      await expect(didRegistry.connect(user1).createDID(didId, "ep"))
        .to.emit(didRegistry, "DIDCreated")
        .and.to.emit(didRegistry, "KeyAdded");
    });

    it("should revert if DID ID is empty", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);

      await expect(
        didRegistry.connect(user1).createDID("", "ep")
      ).to.be.revertedWith("DID ID cannot be empty");
    });

    it("should revert if DID already exists", async function () {
      const { didRegistry, user1, user2 } = await loadFixture(deployFixture);
      const didId = "did:vault:dup";

      await didRegistry.connect(user1).createDID(didId, "ep");
      await expect(
        didRegistry.connect(user2).createDID(didId, "ep2")
      ).to.be.revertedWith("DID already exists");
    });

    it("should revert if address already has a DID", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);

      await didRegistry.connect(user1).createDID("did:vault:first", "ep");
      await expect(
        didRegistry.connect(user1).createDID("did:vault:second", "ep")
      ).to.be.revertedWith("Address already has a DID");
    });

    it("should allow empty service endpoint", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);

      await didRegistry.connect(user1).createDID("did:vault:noep", "");
      const doc = await didRegistry.getDIDDocument("did:vault:noep");
      expect(doc.serviceEndpoint).to.equal("");
    });

    it("should allow different users to create different DIDs", async function () {
      const { didRegistry, user1, user2 } = await loadFixture(deployFixture);

      await didRegistry.connect(user1).createDID("did:vault:u1", "ep1");
      await didRegistry.connect(user2).createDID("did:vault:u2", "ep2");

      const doc1 = await didRegistry.getDIDDocument("did:vault:u1");
      const doc2 = await didRegistry.getDIDDocument("did:vault:u2");
      expect(doc1.controller).to.equal(user1.address);
      expect(doc2.controller).to.equal(user2.address);
    });
  });

  // =========================================================================
  // updateServiceEndpoint
  // =========================================================================

  describe("updateServiceEndpoint", function () {
    it("should update the service endpoint", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).updateServiceEndpoint(didId, "https://new.com");

      const doc = await didRegistry.getDIDDocument(didId);
      expect(doc.serviceEndpoint).to.equal("https://new.com");
    });

    it("should update the updated timestamp", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);
      const docBefore = await didRegistry.getDIDDocument(didId);

      await didRegistry.connect(user1).updateServiceEndpoint(didId, "ep");

      const docAfter = await didRegistry.getDIDDocument(didId);
      expect(docAfter.updated).to.be.greaterThanOrEqual(docBefore.updated);
    });

    it("should emit DIDUpdated event", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await expect(didRegistry.connect(user1).updateServiceEndpoint(didId, "ep"))
        .to.emit(didRegistry, "DIDUpdated");
    });

    it("should revert if DID does not exist", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);

      await expect(
        didRegistry.connect(user1).updateServiceEndpoint("did:nonexistent", "ep")
      ).to.be.revertedWith("DID does not exist");
    });

    it("should revert if caller is not the controller", async function () {
      const { didRegistry, user2, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user2).updateServiceEndpoint(didId, "ep")
      ).to.be.revertedWith("Only DID controller can perform this action");
    });

    it("should revert if DID is deactivated", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).deactivateDID(didId);
      await expect(
        didRegistry.connect(user1).updateServiceEndpoint(didId, "ep")
      ).to.be.revertedWith("DID is deactivated");
    });
  });

  // =========================================================================
  // deactivateDID
  // =========================================================================

  describe("deactivateDID", function () {
    it("should deactivate the DID", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).deactivateDID(didId);

      const doc = await didRegistry.getDIDDocument(didId);
      expect(doc.active).to.be.false;
    });

    it("should revoke all keys on deactivation", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1); // Delegation key
      await didRegistry.connect(user1).deactivateDID(didId);

      const keys = await didRegistry.getKeys(didId);
      for (const key of keys) {
        expect(key.active).to.be.false;
        expect(key.revokedAt).to.be.greaterThan(0);
      }
    });

    it("should clear reverse lookup so address can create new DID", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).deactivateDID(didId);

      expect(await didRegistry.resolveDID(user1.address)).to.equal("");
    });

    it("should emit DIDDeactivated event", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await expect(didRegistry.connect(user1).deactivateDID(didId))
        .to.emit(didRegistry, "DIDDeactivated");
    });

    it("should revert if DID does not exist", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);

      await expect(
        didRegistry.connect(user1).deactivateDID("did:nonexistent")
      ).to.be.revertedWith("DID does not exist");
    });

    it("should revert if caller is not the controller", async function () {
      const { didRegistry, user2, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user2).deactivateDID(didId)
      ).to.be.revertedWith("Only DID controller can perform this action");
    });

    it("should revert if already deactivated", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).deactivateDID(didId);
      await expect(
        didRegistry.connect(user1).deactivateDID(didId)
      ).to.be.revertedWith("DID is deactivated");
    });

    it("should prevent further updates after deactivation", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).deactivateDID(didId);
      await expect(
        didRegistry.connect(user1).updateServiceEndpoint(didId, "ep")
      ).to.be.revertedWith("DID is deactivated");
    });

    it("should prevent controller transfer after deactivation", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).deactivateDID(didId);
      await expect(
        didRegistry.connect(user1).transferController(didId, user2.address)
      ).to.be.revertedWith("DID is deactivated");
    });
  });

  // =========================================================================
  // transferController
  // =========================================================================

  describe("transferController", function () {
    it("should transfer controller to a new address", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).transferController(didId, user2.address);

      const doc = await didRegistry.getDIDDocument(didId);
      expect(doc.controller).to.equal(user2.address);
    });

    it("should update reverse lookup for both old and new controller", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).transferController(didId, user2.address);

      expect(await didRegistry.resolveDID(user1.address)).to.equal("");
      expect(await didRegistry.resolveDID(user2.address)).to.equal(didId);
    });

    it("should revoke old controller auth key and add new one", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).transferController(didId, user2.address);

      expect(await didRegistry.hasActiveKey(didId, user1.address, 0)).to.be.false;
      expect(await didRegistry.hasActiveKey(didId, user2.address, 0)).to.be.true;
    });

    it("should allow the new controller to manage the DID", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).transferController(didId, user2.address);
      await didRegistry.connect(user2).updateServiceEndpoint(didId, "new-ep");

      const doc = await didRegistry.getDIDDocument(didId);
      expect(doc.serviceEndpoint).to.equal("new-ep");
    });

    it("should prevent the old controller from managing the DID", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).transferController(didId, user2.address);
      await expect(
        didRegistry.connect(user1).updateServiceEndpoint(didId, "ep")
      ).to.be.revertedWith("Only DID controller can perform this action");
    });

    it("should emit DIDControllerTransferred, KeyRevoked, and KeyAdded events", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await expect(didRegistry.connect(user1).transferController(didId, user2.address))
        .to.emit(didRegistry, "DIDControllerTransferred")
        .and.to.emit(didRegistry, "KeyRevoked")
        .and.to.emit(didRegistry, "KeyAdded");
    });

    it("should revert if new controller already has a DID", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user2).createDID("did:vault:u2", "ep");
      await expect(
        didRegistry.connect(user1).transferController(didId, user2.address)
      ).to.be.revertedWith("New controller already has a DID");
    });

    it("should revert if DID does not exist", async function () {
      const { didRegistry, user1, user2 } = await loadFixture(deployFixture);

      await expect(
        didRegistry.connect(user1).transferController("did:nonexistent", user2.address)
      ).to.be.revertedWith("DID does not exist");
    });

    it("should revert if caller is not the controller", async function () {
      const { didRegistry, user2, user3, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user2).transferController(didId, user3.address)
      ).to.be.revertedWith("Only DID controller can perform this action");
    });

    it("should revert if new controller is zero address", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user1).transferController(didId, ethers.ZeroAddress)
      ).to.be.revertedWith("New controller cannot be zero address");
    });

    it("should revert if new controller is the same as current", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user1).transferController(didId, user1.address)
      ).to.be.revertedWith("New controller must be different");
    });

    it("should revert if DID is deactivated", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).deactivateDID(didId);
      await expect(
        didRegistry.connect(user1).transferController(didId, user2.address)
      ).to.be.revertedWith("DID is deactivated");
    });

    it("should update the updated timestamp", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);
      const docBefore = await didRegistry.getDIDDocument(didId);

      await didRegistry.connect(user1).transferController(didId, user2.address);

      const docAfter = await didRegistry.getDIDDocument(didId);
      expect(docAfter.updated).to.be.greaterThanOrEqual(docBefore.updated);
    });

    it("should preserve key rotation history", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).transferController(didId, user2.address);

      const keys = await didRegistry.getKeys(didId);
      expect(keys.length).to.equal(2);
      // First key (user1) should be revoked
      expect(keys[0].keyAddress).to.equal(user1.address);
      expect(keys[0].active).to.be.false;
      expect(keys[0].revokedAt).to.be.greaterThan(0);
      // Second key (user2) should be active
      expect(keys[1].keyAddress).to.equal(user2.address);
      expect(keys[1].active).to.be.true;
    });
  });

  // =========================================================================
  // Key Management (addKey / revokeKey)
  // =========================================================================

  describe("addKey", function () {
    it("should add a delegation key", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1); // Delegation

      expect(await didRegistry.hasActiveKey(didId, user2.address, 1)).to.be.true;
    });

    it("should add an authentication key", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 0); // Authentication

      expect(await didRegistry.hasActiveKey(didId, user2.address, 0)).to.be.true;
    });

    it("should emit KeyAdded event", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await expect(didRegistry.connect(user1).addKey(didId, user2.address, 1))
        .to.emit(didRegistry, "KeyAdded");
    });

    it("should revert if key address is zero", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user1).addKey(didId, ethers.ZeroAddress, 1)
      ).to.be.revertedWith("Key address cannot be zero");
    });

    it("should revert if key is already active", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1);
      await expect(
        didRegistry.connect(user1).addKey(didId, user2.address, 0)
      ).to.be.revertedWith("Key already active for this DID");
    });

    it("should allow re-adding a previously revoked key", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1);
      await didRegistry.connect(user1).revokeKey(didId, user2.address);

      // Should succeed since the key was revoked
      await didRegistry.connect(user1).addKey(didId, user2.address, 1);
      expect(await didRegistry.hasActiveKey(didId, user2.address, 1)).to.be.true;
    });

    it("should revert if max keys reached", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      // user1's auth key is key #1, so we can add 19 more using random wallets
      for (let i = 0; i < 19; i++) {
        const wallet = ethers.Wallet.createRandom();
        await didRegistry.connect(user1).addKey(didId, wallet.address, 1);
      }

      const extraWallet = ethers.Wallet.createRandom();
      await expect(
        didRegistry.connect(user1).addKey(didId, extraWallet.address, 1)
      ).to.be.revertedWith("Maximum keys reached");
    });

    it("should revert if caller is not the controller", async function () {
      const { didRegistry, user2, user3, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user2).addKey(didId, user3.address, 1)
      ).to.be.revertedWith("Only DID controller can perform this action");
    });
  });

  describe("revokeKey", function () {
    it("should revoke a delegation key", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1);
      await didRegistry.connect(user1).revokeKey(didId, user2.address);

      expect(await didRegistry.hasActiveKey(didId, user2.address, 1)).to.be.false;
    });

    it("should set revokedAt timestamp", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1);
      await didRegistry.connect(user1).revokeKey(didId, user2.address);

      const keys = await didRegistry.getKeys(didId);
      const revokedKey = keys.find(k => k.keyAddress === user2.address);
      expect(revokedKey.revokedAt).to.be.greaterThan(0);
    });

    it("should emit KeyRevoked event", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1);
      await expect(didRegistry.connect(user1).revokeKey(didId, user2.address))
        .to.emit(didRegistry, "KeyRevoked");
    });

    it("should revert if trying to revoke own controller key", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user1).revokeKey(didId, user1.address)
      ).to.be.revertedWith("Cannot revoke own controller key");
    });

    it("should revert if key not found", async function () {
      const { didRegistry, user1, user3, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user1).revokeKey(didId, user3.address)
      ).to.be.revertedWith("Key not found");
    });

    it("should revert if key already revoked (index cleared)", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1);
      await didRegistry.connect(user1).revokeKey(didId, user2.address);
      await expect(
        didRegistry.connect(user1).revokeKey(didId, user2.address)
      ).to.be.revertedWith("Key not found");
    });
  });

  // =========================================================================
  // Key History (wasKeyValidAt)
  // =========================================================================

  describe("wasKeyValidAt", function () {
    it("should return true for a key that was active at the given time", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);
      const doc = await didRegistry.getDIDDocument(didId);
      const createdAt = doc.created;

      expect(await didRegistry.wasKeyValidAt(didId, user1.address, createdAt)).to.be.true;
    });

    it("should return false for a time before the key was added", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);
      const doc = await didRegistry.getDIDDocument(didId);
      const createdAt = doc.created;

      expect(await didRegistry.wasKeyValidAt(didId, user1.address, createdAt - 1n)).to.be.false;
    });

    it("should return false for a revoked key after revocation time", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1);
      const keysBefore = await didRegistry.getKeys(didId);
      const addedAt = keysBefore[1].addedAt;

      await didRegistry.connect(user1).revokeKey(didId, user2.address);
      const keysAfter = await didRegistry.getKeys(didId);
      const revokedAt = keysAfter[1].revokedAt;

      // Valid during active period
      expect(await didRegistry.wasKeyValidAt(didId, user2.address, addedAt)).to.be.true;
      // Invalid after revocation
      expect(await didRegistry.wasKeyValidAt(didId, user2.address, revokedAt)).to.be.false;
    });

    it("should return true for a rotated controller key at pre-rotation time", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);
      const doc = await didRegistry.getDIDDocument(didId);
      const originalTime = doc.created;

      await didRegistry.connect(user1).transferController(didId, user2.address);

      // Old key was valid at the original time
      expect(await didRegistry.wasKeyValidAt(didId, user1.address, originalTime)).to.be.true;
    });

    it("should return false for a non-existent key", async function () {
      const { didRegistry, user2, didId } = await loadFixture(deployWithDIDFixture);
      expect(await didRegistry.wasKeyValidAt(didId, user2.address, 999999999)).to.be.false;
    });

    it("should revert for a non-existent DID", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);
      await expect(
        didRegistry.wasKeyValidAt("did:nonexistent", user1.address, 999999999)
      ).to.be.revertedWith("DID does not exist");
    });
  });

  // =========================================================================
  // Nonce
  // =========================================================================

  describe("incrementNonce", function () {
    it("should start at 0", async function () {
      const { didRegistry, didId } = await loadFixture(deployWithDIDFixture);
      expect(await didRegistry.nonces(didId)).to.equal(0);
    });

    it("should increment the nonce", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).incrementNonce(didId);
      expect(await didRegistry.nonces(didId)).to.equal(1);

      await didRegistry.connect(user1).incrementNonce(didId);
      expect(await didRegistry.nonces(didId)).to.equal(2);
    });

    it("should return the new nonce value", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      const newNonce = await didRegistry.connect(user1).incrementNonce.staticCall(didId);
      expect(newNonce).to.equal(1);
    });

    it("should emit NonceIncremented event", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await expect(didRegistry.connect(user1).incrementNonce(didId))
        .to.emit(didRegistry, "NonceIncremented");
    });

    it("should revert if caller is not the controller", async function () {
      const { didRegistry, user2, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user2).incrementNonce(didId)
      ).to.be.revertedWith("Only DID controller can perform this action");
    });

    it("should revert if DID is deactivated", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).deactivateDID(didId);
      await expect(
        didRegistry.connect(user1).incrementNonce(didId)
      ).to.be.revertedWith("DID is deactivated");
    });
  });

  // =========================================================================
  // View Functions
  // =========================================================================

  describe("getDIDDocument", function () {
    it("should return the DID document", async function () {
      const { didRegistry, user1, didId, serviceEndpoint } = await loadFixture(deployWithDIDFixture);

      const doc = await didRegistry.getDIDDocument(didId);
      expect(doc.controller).to.equal(user1.address);
      expect(doc.serviceEndpoint).to.equal(serviceEndpoint);
      expect(doc.active).to.be.true;
    });

    it("should revert if DID does not exist", async function () {
      const { didRegistry } = await loadFixture(deployFixture);

      await expect(
        didRegistry.getDIDDocument("did:nonexistent")
      ).to.be.revertedWith("DID does not exist");
    });

    it("should return deactivated DID document with active false", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).deactivateDID(didId);
      const doc = await didRegistry.getDIDDocument(didId);
      expect(doc.active).to.be.false;
      expect(doc.controller).to.equal(user1.address);
    });
  });

  describe("verifyDIDController", function () {
    it("should return true for the active controller", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);
      expect(await didRegistry.verifyDIDController(didId, user1.address)).to.be.true;
    });

    it("should return false for a non-controller address", async function () {
      const { didRegistry, user2, didId } = await loadFixture(deployWithDIDFixture);
      expect(await didRegistry.verifyDIDController(didId, user2.address)).to.be.false;
    });

    it("should return false for a non-existent DID", async function () {
      const { didRegistry, user1 } = await loadFixture(deployFixture);
      expect(await didRegistry.verifyDIDController("did:nonexistent", user1.address)).to.be.false;
    });

    it("should return false for a deactivated DID", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);
      await didRegistry.connect(user1).deactivateDID(didId);
      expect(await didRegistry.verifyDIDController(didId, user1.address)).to.be.false;
    });

    it("should return true for new controller after transfer", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);
      await didRegistry.connect(user1).transferController(didId, user2.address);
      expect(await didRegistry.verifyDIDController(didId, user2.address)).to.be.true;
      expect(await didRegistry.verifyDIDController(didId, user1.address)).to.be.false;
    });

    it("should return false for zero address", async function () {
      const { didRegistry, didId } = await loadFixture(deployWithDIDFixture);
      expect(await didRegistry.verifyDIDController(didId, ethers.ZeroAddress)).to.be.false;
    });
  });

  describe("getKeys", function () {
    it("should return all keys including revoked", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1);
      await didRegistry.connect(user1).revokeKey(didId, user2.address);

      const keys = await didRegistry.getKeys(didId);
      expect(keys.length).to.equal(2); // auth key + revoked delegation key
    });

    it("should revert for non-existent DID", async function () {
      const { didRegistry } = await loadFixture(deployFixture);

      await expect(didRegistry.getKeys("did:none")).to.be.revertedWith("DID does not exist");
    });
  });

  describe("getActiveKeysByType", function () {
    it("should return only active keys of the requested type", async function () {
      const { didRegistry, user1, user2, user3, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1); // Delegation
      await didRegistry.connect(user1).addKey(didId, user3.address, 1); // Delegation

      const delegationKeys = await didRegistry.getActiveKeysByType(didId, 1);
      expect(delegationKeys.length).to.equal(2);

      const authKeys = await didRegistry.getActiveKeysByType(didId, 0);
      expect(authKeys.length).to.equal(1);
      expect(authKeys[0].keyAddress).to.equal(user1.address);
    });

    it("should not include revoked keys", async function () {
      const { didRegistry, user1, user2, user3, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1);
      await didRegistry.connect(user1).addKey(didId, user3.address, 1);
      await didRegistry.connect(user1).revokeKey(didId, user2.address);

      const delegationKeys = await didRegistry.getActiveKeysByType(didId, 1);
      expect(delegationKeys.length).to.equal(1);
      expect(delegationKeys[0].keyAddress).to.equal(user3.address);
    });
  });

  describe("hasActiveKey", function () {
    it("should return true for active key with correct type", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);
      expect(await didRegistry.hasActiveKey(didId, user1.address, 0)).to.be.true;
    });

    it("should return false for wrong key type", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);
      expect(await didRegistry.hasActiveKey(didId, user1.address, 1)).to.be.false;
    });

    it("should return false for non-existent key", async function () {
      const { didRegistry, user2, didId } = await loadFixture(deployWithDIDFixture);
      expect(await didRegistry.hasActiveKey(didId, user2.address, 0)).to.be.false;
    });

    it("should return false for revoked key", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).addKey(didId, user2.address, 1);
      await didRegistry.connect(user1).revokeKey(didId, user2.address);
      expect(await didRegistry.hasActiveKey(didId, user2.address, 1)).to.be.false;
    });
  });

  describe("resolveDID", function () {
    it("should return DID for an address that has one", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);
      expect(await didRegistry.resolveDID(user1.address)).to.equal(didId);
    });

    it("should return empty string for address with no DID", async function () {
      const { didRegistry, user2 } = await loadFixture(deployWithDIDFixture);
      expect(await didRegistry.resolveDID(user2.address)).to.equal("");
    });

    it("should return empty string after DID deactivation", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).deactivateDID(didId);
      expect(await didRegistry.resolveDID(user1.address)).to.equal("");
    });

    it("should update after controller transfer", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).transferController(didId, user2.address);
      expect(await didRegistry.resolveDID(user1.address)).to.equal("");
      expect(await didRegistry.resolveDID(user2.address)).to.equal(didId);
    });
  });

  // =========================================================================
  // Guardian Management
  // =========================================================================

  describe("setupGuardians", function () {
    it("should set up guardians and threshold", async function () {
      const { didRegistry, user1, user2, user3, didId } = await loadFixture(deployWithDIDFixture);
      const signers = await ethers.getSigners();
      const g1 = user2.address;
      const g2 = user3.address;

      await didRegistry.connect(user1).setupGuardians(didId, [g1, g2], 2);

      const [guardians, threshold] = await didRegistry.getGuardians(didId);
      expect(guardians.length).to.equal(2);
      expect(threshold).to.equal(2);
      expect(await didRegistry.isGuardian(didId, g1)).to.be.true;
      expect(await didRegistry.isGuardian(didId, g2)).to.be.true;
    });

    it("should emit GuardianAdded and GuardianThresholdUpdated events", async function () {
      const { didRegistry, user1, user2, user3, didId } = await loadFixture(deployWithDIDFixture);

      await expect(didRegistry.connect(user1).setupGuardians(didId, [user2.address, user3.address], 2))
        .to.emit(didRegistry, "GuardianAdded")
        .and.to.emit(didRegistry, "GuardianThresholdUpdated");
    });

    it("should revert if guardians already configured", async function () {
      const { didRegistry, user1, user2, user3, didId } = await loadFixture(deployWithDIDFixture);

      await didRegistry.connect(user1).setupGuardians(didId, [user2.address, user3.address], 2);
      await expect(
        didRegistry.connect(user1).setupGuardians(didId, [user2.address, user3.address], 2)
      ).to.be.revertedWith("Guardians already configured");
    });

    it("should revert if fewer than 2 guardians", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user1).setupGuardians(didId, [user2.address], 1)
      ).to.be.revertedWith("Must have 2-5 guardians");
    });

    it("should revert if more than 5 guardians", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);
      const signers = await ethers.getSigners();
      const six = signers.slice(4, 10).map(s => s.address);

      await expect(
        didRegistry.connect(user1).setupGuardians(didId, six, 3)
      ).to.be.revertedWith("Must have 2-5 guardians");
    });

    it("should revert if threshold < 2", async function () {
      const { didRegistry, user1, user2, user3, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user1).setupGuardians(didId, [user2.address, user3.address], 1)
      ).to.be.revertedWith("Threshold must be >= 2 and <= guardian count");
    });

    it("should revert if threshold > guardian count", async function () {
      const { didRegistry, user1, user2, user3, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user1).setupGuardians(didId, [user2.address, user3.address], 3)
      ).to.be.revertedWith("Threshold must be >= 2 and <= guardian count");
    });

    it("should revert if controller is a guardian", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user1).setupGuardians(didId, [user1.address, user2.address], 2)
      ).to.be.revertedWith("Controller cannot be own guardian");
    });

    it("should revert on duplicate guardian", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user1).setupGuardians(didId, [user2.address, user2.address], 2)
      ).to.be.revertedWith("Duplicate guardian");
    });

    it("should revert if caller is not controller", async function () {
      const { didRegistry, user2, user3, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user2).setupGuardians(didId, [user2.address, user3.address], 2)
      ).to.be.revertedWith("Only DID controller can perform this action");
    });
  });

  describe("addGuardian", function () {
    async function deployWithGuardiansFixture() {
      const fixture = await loadFixture(deployWithDIDFixture);
      const { didRegistry, user1, user2, user3 } = fixture;
      await didRegistry.connect(user1).setupGuardians(fixture.didId, [user2.address, user3.address], 2);
      return fixture;
    }

    it("should add a new guardian", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithGuardiansFixture);
      const signers = await ethers.getSigners();
      const newGuardian = signers[4];

      await didRegistry.connect(user1).addGuardian(didId, newGuardian.address);

      expect(await didRegistry.isGuardian(didId, newGuardian.address)).to.be.true;
      const [guardians] = await didRegistry.getGuardians(didId);
      expect(guardians.length).to.equal(3);
    });

    it("should revert if guardians not configured", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithDIDFixture);

      await expect(
        didRegistry.connect(user1).addGuardian(didId, user2.address)
      ).to.be.revertedWith("Guardians not configured");
    });

    it("should revert if max guardians reached", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWithGuardiansFixture);
      const signers = await ethers.getSigners();

      // Already have 2, add 3 more to reach max of 5
      await didRegistry.connect(user1).addGuardian(didId, signers[4].address);
      await didRegistry.connect(user1).addGuardian(didId, signers[5].address);
      await didRegistry.connect(user1).addGuardian(didId, signers[6].address);

      await expect(
        didRegistry.connect(user1).addGuardian(didId, signers[7].address)
      ).to.be.revertedWith("Maximum guardians reached");
    });

    it("should revert if already a guardian", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWithGuardiansFixture);

      await expect(
        didRegistry.connect(user1).addGuardian(didId, user2.address)
      ).to.be.revertedWith("Already a guardian");
    });
  });

  describe("removeGuardian", function () {
    async function deployWith3GuardiansFixture() {
      const fixture = await loadFixture(deployWithDIDFixture);
      const { didRegistry, user1, user2, user3 } = fixture;
      const signers = await ethers.getSigners();
      const g3 = signers[4];
      await didRegistry.connect(user1).setupGuardians(
        fixture.didId, [user2.address, user3.address, g3.address], 2
      );
      return { ...fixture, g3 };
    }

    it("should remove a guardian", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWith3GuardiansFixture);

      await didRegistry.connect(user1).removeGuardian(didId, user2.address);

      expect(await didRegistry.isGuardian(didId, user2.address)).to.be.false;
      const [guardians] = await didRegistry.getGuardians(didId);
      expect(guardians.length).to.equal(2);
    });

    it("should emit GuardianRemoved event", async function () {
      const { didRegistry, user1, user2, didId } = await loadFixture(deployWith3GuardiansFixture);

      await expect(didRegistry.connect(user1).removeGuardian(didId, user2.address))
        .to.emit(didRegistry, "GuardianRemoved");
    });

    it("should revert if removing would go below minimum", async function () {
      const { didRegistry, user1, user2, user3, didId } = await loadFixture(deployWithDIDFixture);
      await didRegistry.connect(user1).setupGuardians(didId, [user2.address, user3.address], 2);

      await expect(
        didRegistry.connect(user1).removeGuardian(didId, user2.address)
      ).to.be.revertedWith("Cannot go below minimum guardians");
    });

    it("should revert if removing would invalidate threshold", async function () {
      const { didRegistry, user1, user2, user3, didId } = await loadFixture(deployWithDIDFixture);
      const signers = await ethers.getSigners();
      const g3 = signers[4];
      await didRegistry.connect(user1).setupGuardians(
        didId, [user2.address, user3.address, g3.address], 3
      );

      // Can't remove when 3 guardians and threshold is 3
      await expect(
        didRegistry.connect(user1).removeGuardian(didId, user2.address)
      ).to.be.revertedWith("Would invalidate threshold");
    });

    it("should revert if not a guardian", async function () {
      const { didRegistry, user1, didId } = await loadFixture(deployWith3GuardiansFixture);
      const signers = await ethers.getSigners();

      await expect(
        didRegistry.connect(user1).removeGuardian(didId, signers[10].address)
      ).to.be.revertedWith("Not a guardian");
    });
  });

  // =========================================================================
  // Recovery
  // =========================================================================

  describe("Recovery workflow", function () {
    async function deployWithGuardiansFixture() {
      const fixture = await loadFixture(deployWithDIDFixture);
      const { didRegistry, user1, user2, user3 } = fixture;
      const signers = await ethers.getSigners();
      const g3 = signers[4];
      const newOwner = signers[5];

      await didRegistry.connect(user1).setupGuardians(
        fixture.didId, [user2.address, user3.address, g3.address], 2
      );

      return { ...fixture, g3, newOwner };
    }

    describe("initiateRecovery", function () {
      it("should initiate a recovery request", async function () {
        const { didRegistry, user2, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);

        const [nc, initiatedAt, executeAfter, status, approvalCount] = await didRegistry.getRecoveryRequest(didId);
        expect(nc).to.equal(newOwner.address);
        expect(status).to.equal(1); // Pending
        expect(approvalCount).to.equal(1); // Initiator auto-approves
        expect(executeAfter).to.equal(initiatedAt + BigInt(48 * 3600));
      });

      it("should emit RecoveryInitiated and RecoveryApproved events", async function () {
        const { didRegistry, user2, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await expect(didRegistry.connect(user2).initiateRecovery(didId, newOwner.address))
          .to.emit(didRegistry, "RecoveryInitiated")
          .and.to.emit(didRegistry, "RecoveryApproved");
      });

      it("should revert if caller is not a guardian", async function () {
        const { didRegistry, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);
        const signers = await ethers.getSigners();

        await expect(
          didRegistry.connect(signers[10]).initiateRecovery(didId, newOwner.address)
        ).to.be.revertedWith("Not a guardian of this DID");
      });

      it("should revert if recovery already in progress", async function () {
        const { didRegistry, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await expect(
          didRegistry.connect(user3).initiateRecovery(didId, newOwner.address)
        ).to.be.revertedWith("Recovery already in progress");
      });

      it("should revert if new controller already has a DID", async function () {
        const { didRegistry, user2, user3, didId } = await loadFixture(deployWithGuardiansFixture);

        // user3 is a guardian but also doesn't have a DID... let's use user2
        // Actually user2 has no DID. Let me create one for newOwner first.
        const signers = await ethers.getSigners();
        const hasDidSigner = signers[6];
        await didRegistry.connect(hasDidSigner).createDID("did:vault:taken", "ep");

        await expect(
          didRegistry.connect(user2).initiateRecovery(didId, hasDidSigner.address)
        ).to.be.revertedWith("New controller already has a DID");
      });

      it("should allow re-initiation after cancellation", async function () {
        const { didRegistry, user1, user2, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user1).cancelRecovery(didId);

        // Should be able to initiate again
        await expect(
          didRegistry.connect(user2).initiateRecovery(didId, newOwner.address)
        ).to.not.be.reverted;
      });
    });

    describe("approveRecovery", function () {
      it("should increment approval count", async function () {
        const { didRegistry, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);

        const [, , , , approvalCount] = await didRegistry.getRecoveryRequest(didId);
        expect(approvalCount).to.equal(2);
      });

      it("should revert if already approved by this guardian", async function () {
        const { didRegistry, user2, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await expect(
          didRegistry.connect(user2).approveRecovery(didId)
        ).to.be.revertedWith("Already approved");
      });

      it("should revert if no pending recovery", async function () {
        const { didRegistry, user2, didId } = await loadFixture(deployWithGuardiansFixture);

        await expect(
          didRegistry.connect(user2).approveRecovery(didId)
        ).to.be.revertedWith("No pending recovery");
      });

      it("should revert if not a guardian", async function () {
        const { didRegistry, user2, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);
        const signers = await ethers.getSigners();

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await expect(
          didRegistry.connect(signers[10]).approveRecovery(didId)
        ).to.be.revertedWith("Not a guardian of this DID");
      });
    });

    describe("executeRecovery", function () {
      it("should transfer control after time-lock and threshold met", async function () {
        const { didRegistry, user1, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);

        // Fast forward past time-lock
        await time.increase(48 * 3600 + 1);

        await didRegistry.connect(user2).executeRecovery(didId);

        const doc = await didRegistry.getDIDDocument(didId);
        expect(doc.controller).to.equal(newOwner.address);
        expect(await didRegistry.resolveDID(newOwner.address)).to.equal(didId);
        expect(await didRegistry.resolveDID(user1.address)).to.equal("");
      });

      it("should emit RecoveryExecuted event", async function () {
        const { didRegistry, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);
        await time.increase(48 * 3600 + 1);

        await expect(didRegistry.connect(user2).executeRecovery(didId))
          .to.emit(didRegistry, "RecoveryExecuted");
      });

      it("should rotate auth keys during recovery", async function () {
        const { didRegistry, user1, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);
        await time.increase(48 * 3600 + 1);
        await didRegistry.connect(user2).executeRecovery(didId);

        expect(await didRegistry.hasActiveKey(didId, user1.address, 0)).to.be.false;
        expect(await didRegistry.hasActiveKey(didId, newOwner.address, 0)).to.be.true;
      });

      it("should revert if time-lock not expired", async function () {
        const { didRegistry, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);

        // Don't fast forward
        await expect(
          didRegistry.connect(user2).executeRecovery(didId)
        ).to.be.revertedWith("Time-lock not expired");
      });

      it("should revert if insufficient approvals", async function () {
        const { didRegistry, user2, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        // Only 1 approval (the initiator), threshold is 2
        await time.increase(48 * 3600 + 1);

        await expect(
          didRegistry.connect(user2).executeRecovery(didId)
        ).to.be.revertedWith("Insufficient guardian approvals");
      });

      it("should revert if not a guardian", async function () {
        const { didRegistry, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);
        const signers = await ethers.getSigners();

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);
        await time.increase(48 * 3600 + 1);

        await expect(
          didRegistry.connect(signers[10]).executeRecovery(didId)
        ).to.be.revertedWith("Not a guardian of this DID");
      });
    });

    describe("cancelRecovery", function () {
      it("should cancel a pending recovery", async function () {
        const { didRegistry, user1, user2, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user1).cancelRecovery(didId);

        const [, , , status] = await didRegistry.getRecoveryRequest(didId);
        expect(status).to.equal(3); // Cancelled
      });

      it("should emit RecoveryCancelled event", async function () {
        const { didRegistry, user1, user2, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await expect(didRegistry.connect(user1).cancelRecovery(didId))
          .to.emit(didRegistry, "RecoveryCancelled");
      });

      it("should revert if no pending recovery", async function () {
        const { didRegistry, user1, didId } = await loadFixture(deployWithGuardiansFixture);

        await expect(
          didRegistry.connect(user1).cancelRecovery(didId)
        ).to.be.revertedWith("No pending recovery to cancel");
      });

      it("should revert if caller is not controller", async function () {
        const { didRegistry, user2, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await expect(
          didRegistry.connect(user2).cancelRecovery(didId)
        ).to.be.revertedWith("Only DID controller can perform this action");
      });

      it("should prevent execution after cancellation", async function () {
        const { didRegistry, user1, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);
        await didRegistry.connect(user1).cancelRecovery(didId);

        await time.increase(48 * 3600 + 1);

        await expect(
          didRegistry.connect(user2).executeRecovery(didId)
        ).to.be.revertedWith("No pending recovery");
      });
    });

    describe("Bug fix verifications", function () {
      it("FIX #1: stale approvals are cleared on re-initiation", async function () {
        const { didRegistry, user1, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);
        const signers = await ethers.getSigners();
        const altNewOwner = signers[6];

        // Round 1: guardian2 initiates, guardian3 approves
        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);
        // Count is 2. Cancel.
        await didRegistry.connect(user1).cancelRecovery(didId);

        // Round 2: guardian2 initiates with DIFFERENT target
        await didRegistry.connect(user2).initiateRecovery(didId, altNewOwner.address);

        // guardian3's stale approval should NOT carry over
        const [, , , , approvalCount] = await didRegistry.getRecoveryRequest(didId);
        expect(approvalCount).to.equal(1); // Only the initiator

        // guardian3 should be able to approve again (not "Already approved")
        await didRegistry.connect(user3).approveRecovery(didId);
        const [, , , , newCount] = await didRegistry.getRecoveryRequest(didId);
        expect(newCount).to.equal(2);
      });

      it("FIX #4: removed guardian vote is revoked from pending recovery", async function () {
        const { didRegistry, user1, user2, user3, g3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        // Initiate recovery, user3 approves (count = 2, threshold = 2)
        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);

        const [, , , , countBefore] = await didRegistry.getRecoveryRequest(didId);
        expect(countBefore).to.equal(2);

        // Remove user3 -- their vote should be revoked
        await didRegistry.connect(user1).removeGuardian(didId, user3.address);

        const [, , , , countAfter] = await didRegistry.getRecoveryRequest(didId);
        expect(countAfter).to.equal(1);

        // Now only 1 approval, which is below threshold -- execution should fail
        await time.increase(48 * 3600 + 1);
        await expect(
          didRegistry.connect(user2).executeRecovery(didId)
        ).to.be.revertedWith("Insufficient guardian approvals");
      });

      it("FIX #5: recovery cannot execute on a deactivated DID", async function () {
        const { didRegistry, user1, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);

        // Controller deactivates during time-lock
        await didRegistry.connect(user1).deactivateDID(didId);

        await time.increase(48 * 3600 + 1);

        await expect(
          didRegistry.connect(user2).executeRecovery(didId)
        ).to.be.revertedWith("DID is deactivated");
      });

      it("FIX #6: deactivation cancels pending recovery", async function () {
        const { didRegistry, user1, user2, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);

        await didRegistry.connect(user1).deactivateDID(didId);

        const [, , , status] = await didRegistry.getRecoveryRequest(didId);
        expect(status).to.equal(3); // Cancelled
      });

      it("FIX #8: transferController cancels pending recovery", async function () {
        const { didRegistry, user1, user2, user3, g3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        // Initiate recovery
        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);

        // Controller transfers DID to someone else
        const signers = await ethers.getSigners();
        const transferTarget = signers[6];
        await didRegistry.connect(user1).transferController(didId, transferTarget.address);

        // Recovery should now be cancelled
        const [, , , status] = await didRegistry.getRecoveryRequest(didId);
        expect(status).to.equal(3); // Cancelled

        // Even after timelock, execution should fail
        await time.increase(48 * 3600 + 1);
        await expect(
          didRegistry.connect(user2).executeRecovery(didId)
        ).to.be.revertedWith("No pending recovery");
      });

      it("FIX #9: recovery can be re-initiated after a previous successful recovery", async function () {
        const { didRegistry, user1, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        // Complete a full recovery
        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(didId);
        await time.increase(48 * 3600 + 1);
        await didRegistry.connect(user2).executeRecovery(didId);

        // Verify status is Executed
        const [, , , statusAfter] = await didRegistry.getRecoveryRequest(didId);
        expect(statusAfter).to.equal(2); // Executed

        // Should be able to initiate a new recovery
        const signers = await ethers.getSigners();
        const anotherNewOwner = signers[6];
        await expect(
          didRegistry.connect(user2).initiateRecovery(didId, anotherNewOwner.address)
        ).to.not.be.reverted;

        const [nc, , , newStatus, count] = await didRegistry.getRecoveryRequest(didId);
        expect(nc).to.equal(anotherNewOwner.address);
        expect(newStatus).to.equal(1); // Pending
        expect(count).to.equal(1);
      });

      it("FIX #7: MAX_KEYS enforced on internal _addKey via transferController", async function () {
        const { didRegistry, user1, didId } = await loadFixture(deployWithDIDFixture);

        // Fill up to MAX_KEYS - 1 (controller auth key is #1)
        for (let i = 0; i < 19; i++) {
          const wallet = ethers.Wallet.createRandom();
          await didRegistry.connect(user1).addKey(didId, wallet.address, 1);
        }

        // Now at 20 keys. transferController calls _addKey internally,
        // which would push past MAX_KEYS
        const signers = await ethers.getSigners();
        await expect(
          didRegistry.connect(user1).transferController(didId, signers[5].address)
        ).to.be.revertedWith("Maximum keys reached");
      });
    });

    describe("Full recovery scenario", function () {
      it("should complete a full recovery: initiate -> approve -> wait -> execute", async function () {
        const { didRegistry, user1, user2, user3, newOwner, didId } = await loadFixture(deployWithGuardiansFixture);

        // Guardian 1 initiates
        await didRegistry.connect(user2).initiateRecovery(didId, newOwner.address);

        // Guardian 2 approves (now at threshold)
        await didRegistry.connect(user3).approveRecovery(didId);

        // Wait for time-lock
        await time.increase(48 * 3600 + 1);

        // Execute
        await didRegistry.connect(user2).executeRecovery(didId);

        // Verify new controller
        expect(await didRegistry.verifyDIDController(didId, newOwner.address)).to.be.true;
        expect(await didRegistry.verifyDIDController(didId, user1.address)).to.be.false;

        // New controller can manage the DID
        await didRegistry.connect(newOwner).updateServiceEndpoint(didId, "https://recovered.com");
        const doc = await didRegistry.getDIDDocument(didId);
        expect(doc.serviceEndpoint).to.equal("https://recovered.com");

        // Old controller cannot
        await expect(
          didRegistry.connect(user1).updateServiceEndpoint(didId, "hack")
        ).to.be.revertedWith("Only DID controller can perform this action");
      });
    });

    // --- FIX #10: Recovery removes new controller from guardian set ---

    describe("FIX #10 - Guardian-controller conflict on recovery", function () {
      it("should remove new controller from guardian set if they were a guardian", async function () {
        const { didRegistry, user1, user2, user3 } = await loadFixture(deployWithDIDFixture);
        const did = "did:vault:user1";

        const signers = await ethers.getSigners();
        const guardian3 = signers[4];

        await didRegistry.connect(user1).setupGuardians(
          did, [user2.address, user3.address, guardian3.address], 2
        );

        // Guardians initiate recovery to user2 (who is a guardian)
        await didRegistry.connect(user3).initiateRecovery(did, user2.address);
        await didRegistry.connect(guardian3).approveRecovery(did);
        await time.increase(48 * 3600 + 1);
        await didRegistry.connect(user3).executeRecovery(did);

        // user2 is now controller, should no longer be a guardian
        expect(await didRegistry.isGuardian(did, user2.address)).to.be.false;

        // Guardian count should be reduced
        const [guardians, threshold] = await didRegistry.getGuardians(did);
        expect(guardians.length).to.equal(2);
        expect(guardians).to.not.include(user2.address);
      });

      it("should not affect guardian set if new controller was not a guardian", async function () {
        const { didRegistry, user1, user2, user3 } = await loadFixture(deployWithDIDFixture);
        const did = "did:vault:user1";

        const signers = await ethers.getSigners();
        const guardian3 = signers[4];
        const newOwner = signers[5];

        await didRegistry.connect(user1).setupGuardians(
          did, [user2.address, user3.address, guardian3.address], 2
        );

        await didRegistry.connect(user2).initiateRecovery(did, newOwner.address);
        await didRegistry.connect(user3).approveRecovery(did);
        await time.increase(48 * 3600 + 1);
        await didRegistry.connect(user2).executeRecovery(did);

        // All 3 guardians still intact
        const [guardians] = await didRegistry.getGuardians(did);
        expect(guardians.length).to.equal(3);
      });
    });
  });

  // =========================================================================
  // hasGuardianApproved (FIX #11)
  // =========================================================================

  describe("hasGuardianApproved", function () {
    it("should return false before guardian approves", async function () {
      const { didRegistry, user1, user2, user3 } = await loadFixture(deployWithDIDFixture);
      const did = "did:vault:user1";

      const signers = await ethers.getSigners();
      const guardian3 = signers[4];
      const newOwner = signers[5];

      await didRegistry.connect(user1).setupGuardians(
        did, [user2.address, user3.address, guardian3.address], 2
      );

      await didRegistry.connect(user2).initiateRecovery(did, newOwner.address);

      // Initiator approved, others haven't
      expect(await didRegistry.hasGuardianApproved(did, user2.address)).to.be.true;
      expect(await didRegistry.hasGuardianApproved(did, user3.address)).to.be.false;
      expect(await didRegistry.hasGuardianApproved(did, guardian3.address)).to.be.false;
    });

    it("should return true after guardian approves", async function () {
      const { didRegistry, user1, user2, user3 } = await loadFixture(deployWithDIDFixture);
      const did = "did:vault:user1";

      const signers = await ethers.getSigners();
      const guardian3 = signers[4];
      const newOwner = signers[5];

      await didRegistry.connect(user1).setupGuardians(
        did, [user2.address, user3.address, guardian3.address], 2
      );

      await didRegistry.connect(user2).initiateRecovery(did, newOwner.address);
      await didRegistry.connect(user3).approveRecovery(did);

      expect(await didRegistry.hasGuardianApproved(did, user3.address)).to.be.true;
    });

    it("should return false for non-guardian address", async function () {
      const { didRegistry, user1, user2, user3 } = await loadFixture(deployWithDIDFixture);
      const did = "did:vault:user1";

      const signers = await ethers.getSigners();
      const guardian3 = signers[4];
      const newOwner = signers[5];
      const random = signers[6];

      await didRegistry.connect(user1).setupGuardians(
        did, [user2.address, user3.address, guardian3.address], 2
      );

      await didRegistry.connect(user2).initiateRecovery(did, newOwner.address);

      expect(await didRegistry.hasGuardianApproved(did, random.address)).to.be.false;
    });
  });
});
