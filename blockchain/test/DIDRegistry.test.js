const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DIDRegistry", function () {
  let didRegistry;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    didRegistry = await DIDRegistry.deploy();
  });

  it("Should create a new DID", async function () {
    const didId = "did:example:123";
    const publicKey = "0x123456789abcdef";
    const serviceEndpoint = "https://example.com/did/123";

    await didRegistry.createDID(didId, publicKey, serviceEndpoint);
    
    const didDoc = await didRegistry.getDIDDocument(didId);
    expect(didDoc.controller).to.equal(owner.address);
    expect(didDoc.publicKey).to.equal(publicKey);
    expect(didDoc.active).to.be.true;
  });

  it("Should verify DID controller", async function () {
    const didId = "did:example:456";
    const publicKey = "0x987654321fedcba";
    const serviceEndpoint = "https://example.com/did/456";

    await didRegistry.createDID(didId, publicKey, serviceEndpoint);
    
    const isController = await didRegistry.verifyDIDController(didId, owner.address);
    expect(isController).to.be.true;
    
    const isNotController = await didRegistry.verifyDIDController(didId, addr1.address);
    expect(isNotController).to.be.false;
  });
});
