// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DIDRegistry.sol";
import "./CredentialIssuer.sol";

/**
 * @title CredentialVerifier
 * @dev Implements the employer verification workflow: Request -> Approval -> Verification.
 *      Cross-references DIDRegistry and CredentialIssuer for validation.
 */
contract CredentialVerifier {

    uint256 public constant MAX_CREDENTIALS_PER_REQUEST = 50;
    uint256 public constant MIN_VALID_HOURS = 1;
    uint256 public constant MAX_VALID_HOURS = 8760; // 1 year

    DIDRegistry public didRegistry;
    CredentialIssuer public credentialIssuer;

    struct VerificationRequest {
        string requestId;
        address employer;
        string candidateDID;
        string[] requestedCredentials;
        uint256 requestDate;
        uint256 expirationDate;
        bool isApproved;
        bool isCompleted;
    }

    struct VerificationResult {
        string credentialId;
        bool isValid;
        bool isAuthentic;
        string issuerName;
        string credentialType;
        uint256 verificationDate;
    }

    event VerificationRequested(
        string indexed requestId,
        address indexed employer,
        string candidateDID,
        uint256 timestamp
    );

    event VerificationApproved(
        string indexed requestId,
        string candidateDID,
        uint256 timestamp
    );

    event CredentialVerified(
        string indexed credentialId,
        address indexed employer,
        bool isValid,
        uint256 timestamp
    );

    event VerificationCompleted(
        string indexed requestId,
        address indexed employer,
        uint256 credentialCount,
        uint256 timestamp
    );

    mapping(string => VerificationRequest) public verificationRequests;
    mapping(string => VerificationResult[]) public verificationResults;
    mapping(address => string[]) public employerRequests;
    mapping(string => string[]) public candidateRequests;

    modifier validRequest(string memory requestId) {
        require(bytes(verificationRequests[requestId].requestId).length > 0, "Request does not exist");
        _;
    }

    /**
     * @dev Initializes the contract with references to DIDRegistry and CredentialIssuer.
     * @param _didRegistry Address of the deployed DIDRegistry contract
     * @param _credentialIssuer Address of the deployed CredentialIssuer contract
     */
    constructor(address _didRegistry, address _credentialIssuer) {
        require(_didRegistry != address(0), "DIDRegistry address cannot be zero");
        require(_credentialIssuer != address(0), "CredentialIssuer address cannot be zero");
        didRegistry = DIDRegistry(_didRegistry);
        credentialIssuer = CredentialIssuer(_credentialIssuer);
    }

    /**
     * @dev Creates a verification request for a candidate's credentials.
     * @param requestId Unique identifier for the request
     * @param candidateDID The candidate's DID
     * @param requestedCredentials Array of credential IDs to verify
     * @param validForHours Number of hours the request remains valid (1-8760)
     */
    function requestVerification(
        string memory requestId,
        string memory candidateDID,
        string[] memory requestedCredentials,
        uint256 validForHours
    ) external {
        require(bytes(requestId).length > 0, "Request ID required");
        require(bytes(candidateDID).length > 0, "Candidate DID required");
        require(requestedCredentials.length > 0, "Must request at least one credential");
        require(requestedCredentials.length <= MAX_CREDENTIALS_PER_REQUEST, "Too many credentials requested");
        require(bytes(verificationRequests[requestId].requestId).length == 0, "Request ID already exists");
        require(validForHours >= MIN_VALID_HOURS && validForHours <= MAX_VALID_HOURS, "Valid hours must be between 1 and 8760");
        require(didRegistry.isDIDActive(candidateDID), "Candidate DID is not active");

        uint256 expirationDate = block.timestamp + (validForHours * 1 hours);

        verificationRequests[requestId] = VerificationRequest({
            requestId: requestId,
            employer: msg.sender,
            candidateDID: candidateDID,
            requestedCredentials: requestedCredentials,
            requestDate: block.timestamp,
            expirationDate: expirationDate,
            isApproved: false,
            isCompleted: false
        });

        employerRequests[msg.sender].push(requestId);
        candidateRequests[candidateDID].push(requestId);

        emit VerificationRequested(requestId, msg.sender, candidateDID, block.timestamp);
    }

    /**
     * @dev Approves a verification request. Only the DID controller can approve.
     * @param requestId The request to approve
     */
    function approveVerification(string memory requestId) external validRequest(requestId) {
        VerificationRequest storage request = verificationRequests[requestId];
        require(!request.isApproved, "Request already approved");
        require(block.timestamp <= request.expirationDate, "Request has expired");
        require(!request.isCompleted, "Request already completed");

        require(
            didRegistry.verifyDIDController(request.candidateDID, msg.sender),
            "Only DID controller can approve verification"
        );

        request.isApproved = true;

        emit VerificationApproved(requestId, request.candidateDID, block.timestamp);
    }

    /**
     * @dev Executes verification of all requested credentials. Only the employer who created the request can execute.
     * @param requestId The request to execute
     */
    function executeVerification(string memory requestId) external validRequest(requestId) {
        VerificationRequest storage request = verificationRequests[requestId];
        require(msg.sender == request.employer, "Only the requesting employer can execute verification");
        require(request.isApproved, "Request not approved by candidate");
        require(!request.isCompleted, "Request already completed");
        require(block.timestamp <= request.expirationDate, "Request has expired");

        for (uint256 i = 0; i < request.requestedCredentials.length; i++) {
            string memory credId = request.requestedCredentials[i];

            (bool isAuthentic, bool isValid, string memory issuerName, string memory holderDID, string memory credType) =
                credentialIssuer.verifyCredential(credId);

            bool belongsToCandidate = keccak256(bytes(holderDID)) == keccak256(bytes(request.candidateDID));

            verificationResults[requestId].push(VerificationResult({
                credentialId: credId,
                isValid: isValid && isAuthentic && belongsToCandidate,
                isAuthentic: isAuthentic,
                issuerName: issuerName,
                credentialType: credType,
                verificationDate: block.timestamp
            }));

            emit CredentialVerified(credId, request.employer, isValid && isAuthentic && belongsToCandidate, block.timestamp);
        }

        request.isCompleted = true;

        emit VerificationCompleted(requestId, request.employer, request.requestedCredentials.length, block.timestamp);
    }

    /**
     * @dev Quick verification of a single credential (e.g., for QR code scanning).
     *      This is a public read -- the holder consents by sharing the credential ID (e.g., via QR code).
     * @param credentialId The credential to verify
     * @return isValid Whether the credential is valid
     * @return issuerName The issuing institution
     * @return credentialType The type of credential
     * @return holderDID The holder's DID
     */
    function quickVerify(string memory credentialId) external view returns (
        bool isValid,
        string memory issuerName,
        string memory credentialType,
        string memory holderDID
    ) {
        (bool isAuthentic, bool valid, string memory issuer, string memory holder, string memory credType) =
            credentialIssuer.verifyCredential(credentialId);

        if (!isAuthentic) {
            return (false, "", "", "");
        }

        return (valid, issuer, credType, holder);
    }

    /**
     * @dev Returns verification results for a completed request.
     * @param requestId The request to get results for
     * @return Array of verification results
     */
    function getVerificationResults(string memory requestId) external view validRequest(requestId) returns (VerificationResult[] memory) {
        require(verificationRequests[requestId].isCompleted, "Verification not completed yet");
        return verificationResults[requestId];
    }

    /**
     * @dev Returns all request IDs for a given employer.
     * @param employer The employer's address
     * @return Array of request IDs
     */
    function getEmployerRequests(address employer) external view returns (string[] memory) {
        return employerRequests[employer];
    }

    /**
     * @dev Returns all request IDs for a given candidate DID.
     * @param candidateDID The candidate's DID
     * @return Array of request IDs
     */
    function getCandidateRequests(string memory candidateDID) external view returns (string[] memory) {
        return candidateRequests[candidateDID];
    }
}
