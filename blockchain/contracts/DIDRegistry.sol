// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract DIDRegistry {
    struct DIDDocument {
        address controller;
        string publicKey;
        string serviceEndpoint;
        uint256 created;
        uint256 updated;
        bool active;
    }
    
    event DIDCreated(string indexed didId, address indexed controller, uint256 timestamp);
    
    mapping(string => DIDDocument) public didDocuments;
    mapping(string => bool) public didExists;
    
    function createDID(string memory didId, string memory publicKey, string memory serviceEndpoint) external {
        require(!didExists[didId], "DID already exists");
        require(bytes(didId).length > 0, "DID ID cannot be empty");
        
        didDocuments[didId] = DIDDocument({
            controller: msg.sender,
            publicKey: publicKey,
            serviceEndpoint: serviceEndpoint,
            created: block.timestamp,
            updated: block.timestamp,
            active: true
        });
        
        didExists[didId] = true;
        emit DIDCreated(didId, msg.sender, block.timestamp);
    }
    
    function getDIDDocument(string memory didId) external view returns (DIDDocument memory) {
        require(didExists[didId], "DID does not exist");
        return didDocuments[didId];
    }
    
    function verifyDIDController(string memory didId, address controller) external view returns (bool) {
        if (!didExists[didId]) return false;
        return didDocuments[didId].active && didDocuments[didId].controller == controller;
    }
}
