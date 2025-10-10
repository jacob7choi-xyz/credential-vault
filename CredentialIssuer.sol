// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CredentialIssuer
 * @dev Contract for institutions to issue verifiable credentials
 */
contract CredentialIssuer {
    
    struct Credential {
        string credentialId;
        string holderDID;
        address issuerAddress;
        string institutionName;
        string credentialType;
        string credentialData;
        uint256 issuedDate;
        uint256 expirationDate;
        bool isValid;
        bool isRevoked;
    }
    
    event CredentialIssued(
        string indexed credentialId,
        string indexed holderDID,
        address indexed issuer,
        string institutionName,
        uint256 timestamp
    );
    
    event CredentialRevoked(
        string indexed credentialId,
        address indexed issuer,
        uint256 timestamp
    );
    
    event IssuerRegistered(
        address indexed issuerAddress,
        string institutionName,
        uint256 timestamp
    );
    
    mapping(string => Credential) public credentials;
    mapping(address => string) public registeredIssuers;
    mapping(address => bool) public authorizedIssuers;
    mapping(string => string[]) public holderCredentials;
    
    address public admin;
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }
    
    modifier onlyAuthorizedIssuer() {
        require(authorizedIssuers[msg.sender], "Not authorized to issue credentials");
        _;
    }
    
    modifier validCredential(string memory credentialId) {
        require(bytes(credentials[credentialId].credentialId).length > 0, "Credential does not exist");
        _;
    }
    
    constructor() {
        admin = msg.sender;
    }
    
    function registerIssuer(address issuerAddress, string memory institutionName) external onlyAdmin {
        require(issuerAddress != address(0), "Invalid issuer address");
        require(bytes(institutionName).length > 0, "Institution name required");
        
        registeredIssuers[issuerAddress] = institutionName;
        authorizedIssuers[issuerAddress] = true;
        
        emit IssuerRegistered(issuerAddress, institutionName, block.timestamp);
    }
    
    function issueCredential(
        string memory credentialId,
        string memory holderDID,
        string memory credentialType,
        string memory credentialData,
        uint256 expirationDate
    ) external onlyAuthorizedIssuer {
        require(bytes(credentialId).length > 0, "Credential ID required");
        require(bytes(holderDID).length > 0, "Holder DID required");
        require(bytes(credentials[credentialId].credentialId).length == 0, "Credential already exists");
        
        credentials[credentialId] = Credential({
            credentialId: credentialId,
            holderDID: holderDID,
            issuerAddress: msg.sender,
            institutionName: registeredIssuers[msg.sender],
            credentialType: credentialType,
            credentialData: credentialData,
            issuedDate: block.timestamp,
            expirationDate: expirationDate,
            isValid: true,
            isRevoked: false
        });
        
        holderCredentials[holderDID].push(credentialId);
        
        emit CredentialIssued(
            credentialId,
            holderDID,
            msg.sender,
            registeredIssuers[msg.sender],
            block.timestamp
        );
    }
    
    function revokeCredential(string memory credentialId) external validCredential(credentialId) {
        require(
            credentials[credentialId].issuerAddress == msg.sender,
            "Only credential issuer can revoke"
        );
        require(!credentials[credentialId].isRevoked, "Credential already revoked");
        
        credentials[credentialId].isRevoked = true;
        credentials[credentialId].isValid = false;
        
        emit CredentialRevoked(credentialId, msg.sender, block.timestamp);
    }
    
    function verifyCredential(string memory credentialId) external view returns (
        bool,
        bool,
        string memory,
        string memory
    ) {
        if (bytes(credentials[credentialId].credentialId).length == 0) {
            return (false, false, "", "");
        }
        
        Credential memory cred = credentials[credentialId];
        
        bool notExpired = cred.expirationDate == 0 || block.timestamp < cred.expirationDate;
        bool valid = cred.isValid && !cred.isRevoked && notExpired;
        
        return (true, valid, cred.institutionName, cred.holderDID);
    }
    
    function getHolderCredentials(string memory holderDID) external view returns (string[] memory) {
        return holderCredentials[holderDID];
    }
    
    function getCredential(string memory credentialId) external view validCredential(credentialId) returns (Credential memory) {
        return credentials[credentialId];
    }
    
    function isAuthorizedIssuer(address issuer) external view returns (bool) {
        return authorizedIssuers[issuer];
    }
}
