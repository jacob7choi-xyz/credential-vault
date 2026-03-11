// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DIDRegistry.sol";

/**
 * @title CredentialIssuer
 * @dev Contract for institutions to issue verifiable credentials.
 *      Validates that holder DIDs exist in the DIDRegistry before issuance.
 *      Supports two-step admin transfer for safety.
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

    event IssuerDeauthorized(
        address indexed issuerAddress,
        uint256 timestamp
    );

    event AdminTransferRequested(
        address indexed currentAdmin,
        address indexed pendingAdmin,
        uint256 timestamp
    );

    event AdminTransferred(
        address indexed previousAdmin,
        address indexed newAdmin,
        uint256 timestamp
    );

    DIDRegistry public didRegistry;

    mapping(string => Credential) public credentials;
    mapping(address => string) public registeredIssuers;
    mapping(address => bool) public authorizedIssuers;
    mapping(string => string[]) public holderCredentials;

    address public admin;
    address public pendingAdmin;

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

    /**
     * @dev Initializes the contract with the deployer as admin and a reference to DIDRegistry.
     * @param _didRegistry Address of the deployed DIDRegistry contract
     */
    constructor(address _didRegistry) {
        require(_didRegistry != address(0), "DIDRegistry address cannot be zero");
        admin = msg.sender;
        didRegistry = DIDRegistry(_didRegistry);
    }

    /**
     * @dev Initiates a two-step admin transfer.
     * @param newAdmin Address of the new admin
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "New admin cannot be zero address");
        require(newAdmin != admin, "New admin must be different");
        pendingAdmin = newAdmin;
        emit AdminTransferRequested(admin, newAdmin, block.timestamp);
    }

    /**
     * @dev Completes the admin transfer. Must be called by the pending admin.
     */
    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Only pending admin can accept");
        address previousAdmin = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferred(previousAdmin, admin, block.timestamp);
    }

    /**
     * @dev Registers an institution as an authorized credential issuer.
     * @param issuerAddress Address of the issuer
     * @param institutionName Name of the institution
     */
    function registerIssuer(address issuerAddress, string memory institutionName) external onlyAdmin {
        require(issuerAddress != address(0), "Invalid issuer address");
        require(bytes(institutionName).length > 0, "Institution name required");

        registeredIssuers[issuerAddress] = institutionName;
        authorizedIssuers[issuerAddress] = true;

        emit IssuerRegistered(issuerAddress, institutionName, block.timestamp);
    }

    /**
     * @dev Removes an issuer's authorization. Existing credentials remain valid.
     * @param issuerAddress Address of the issuer to deauthorize
     */
    function deauthorizeIssuer(address issuerAddress) external onlyAdmin {
        require(issuerAddress != address(0), "Invalid issuer address");
        require(authorizedIssuers[issuerAddress], "Issuer not currently authorized");

        authorizedIssuers[issuerAddress] = false;

        emit IssuerDeauthorized(issuerAddress, block.timestamp);
    }

    /**
     * @dev Issues a new credential to a DID holder. Validates the DID exists in the registry.
     * @param credentialId Unique identifier for the credential
     * @param holderDID The DID of the credential holder
     * @param credentialType Type of credential (e.g., "Bachelor's Degree")
     * @param credentialData JSON-encoded credential data
     * @param expirationDate Unix timestamp for expiration (0 = never expires)
     */
    function issueCredential(
        string memory credentialId,
        string memory holderDID,
        string memory credentialType,
        string memory credentialData,
        uint256 expirationDate
    ) external onlyAuthorizedIssuer {
        require(bytes(credentialId).length > 0, "Credential ID required");
        require(bytes(holderDID).length > 0, "Holder DID required");
        require(bytes(credentialType).length > 0, "Credential type required");
        require(bytes(credentials[credentialId].credentialId).length == 0, "Credential already exists");
        require(expirationDate == 0 || expirationDate > block.timestamp, "Expiration must be in the future");
        require(didRegistry.isDIDActive(holderDID), "Holder DID is not active");

        credentials[credentialId] = Credential({
            credentialId: credentialId,
            holderDID: holderDID,
            issuerAddress: msg.sender,
            institutionName: registeredIssuers[msg.sender],
            credentialType: credentialType,
            credentialData: credentialData,
            issuedDate: block.timestamp,
            expirationDate: expirationDate,
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

    /**
     * @dev Revokes a credential. Only the original issuer can revoke.
     * @param credentialId The credential to revoke
     */
    function revokeCredential(string memory credentialId) external validCredential(credentialId) {
        require(
            credentials[credentialId].issuerAddress == msg.sender,
            "Only credential issuer can revoke"
        );
        require(!credentials[credentialId].isRevoked, "Credential already revoked");

        credentials[credentialId].isRevoked = true;

        emit CredentialRevoked(credentialId, msg.sender, block.timestamp);
    }

    /**
     * @dev Verifies a credential's validity including expiration and revocation status.
     * @param credentialId The credential to verify
     * @return exists Whether the credential exists
     * @return valid Whether the credential is currently valid
     * @return institutionName The issuing institution's name
     * @return holderDID The credential holder's DID
     */
    function verifyCredential(string memory credentialId) external view returns (
        bool exists,
        bool valid,
        string memory institutionName,
        string memory holderDID,
        string memory credentialType
    ) {
        if (bytes(credentials[credentialId].credentialId).length == 0) {
            return (false, false, "", "", "");
        }

        Credential memory cred = credentials[credentialId];

        bool notExpired = cred.expirationDate == 0 || block.timestamp < cred.expirationDate;
        bool isValid = !cred.isRevoked && notExpired;

        return (true, isValid, cred.institutionName, cred.holderDID, cred.credentialType);
    }

    /**
     * @dev Returns all credential IDs for a given DID holder.
     * @param holderDID The DID to look up
     * @return Array of credential IDs
     */
    function getHolderCredentials(string memory holderDID) external view returns (string[] memory) {
        return holderCredentials[holderDID];
    }

    /**
     * @dev Returns the full credential data for a given credential ID.
     * @param credentialId The credential to look up
     * @return The credential struct
     */
    function getCredential(string memory credentialId) external view validCredential(credentialId) returns (Credential memory) {
        return credentials[credentialId];
    }

    /**
     * @dev Checks if an address is an authorized issuer.
     * @param issuer The address to check
     * @return True if the address is authorized
     */
    function isAuthorizedIssuer(address issuer) external view returns (bool) {
        return authorizedIssuers[issuer];
    }
}
