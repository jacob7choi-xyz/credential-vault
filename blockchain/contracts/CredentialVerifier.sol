// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DIDRegistry.sol";
import "./CredentialIssuer.sol";

/**
 * @title CredentialVerifier
 * @dev The contract employers use to verify candidate credentials
 */
contract CredentialVerifier {
    
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
    
    mapping(string => VerificationRequest) public verificationRequests;
    mapping(string => VerificationResult[]) public verificationResults;
    mapping(address => string[]) public employerRequests;
    mapping(string => string[]) public candidateRequests;
    
    modifier validRequest(string memory requestId) {
        require(bytes(verificationRequests[requestId].requestId).length > 0, "Request does not exist");
        _;
    }
    
    constructor(address _didRegistry, address _credentialIssuer) {
        didRegistry = DIDRegistry(_didRegistry);
        credentialIssuer = CredentialIssuer(_credentialIssuer);
    }
    
    function requestVerification(
        string memory requestId,
        string memory candidateDID,
        string[] memory requestedCredentials,
        uint256 validForHours
    ) external {
        require(bytes(requestId).length > 0, "Request ID required");
        require(bytes(candidateDID).length > 0, "Candidate DID required");
        require(requestedCredentials.length > 0, "Must request at least one credential");
        require(bytes(verificationRequests[requestId].requestId).length == 0, "Request ID already exists");
        
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
    
    function approveVerification(string memory requestId) external validRequest(requestId) {
        VerificationRequest storage request = verificationRequests[requestId];
        require(block.timestamp <= request.expirationDate, "Request has expired");
        require(!request.isCompleted, "Request already completed");
        
        require(
            didRegistry.verifyDIDController(request.candidateDID, msg.sender),
            "Only DID controller can approve verification"
        );
        
        request.isApproved = true;
        
        emit VerificationApproved(requestId, request.candidateDID, block.timestamp);
    }
    
    function executeVerification(string memory requestId) external validRequest(requestId) {
        VerificationRequest storage request = verificationRequests[requestId];
        require(request.isApproved, "Request not approved by candidate");
        require(!request.isCompleted, "Request already completed");
        require(block.timestamp <= request.expirationDate, "Request has expired");
        
        for (uint i = 0; i < request.requestedCredentials.length; i++) {
            string memory credId = request.requestedCredentials[i];
            
            (bool isAuthentic, bool isValid, string memory issuerName, string memory holderDID) = 
                credentialIssuer.verifyCredential(credId);
            
            bool belongsToCandidate = keccak256(bytes(holderDID)) == keccak256(bytes(request.candidateDID));
            
            verificationResults[requestId].push(VerificationResult({
                credentialId: credId,
                isValid: isValid && isAuthentic && belongsToCandidate,
                isAuthentic: isAuthentic,
                issuerName: issuerName,
                credentialType: isAuthentic ? "Verified" : "Failed",
                verificationDate: block.timestamp
            }));
            
            emit CredentialVerified(credId, request.employer, isValid && isAuthentic, block.timestamp);
        }
        
        request.isCompleted = true;
    }
    
    function quickVerify(string memory credentialId) external view returns (
        bool isValid,
        string memory issuerName,
        string memory credentialType,
        string memory holderDID
    ) {
        (bool isAuthentic, bool valid, string memory issuer, string memory holder) = 
            credentialIssuer.verifyCredential(credentialId);
        
        if (!isAuthentic) {
            return (false, "", "", "");
        }
        
        return (valid, issuer, "Credential", holder);
    }
    
    function getVerificationResults(string memory requestId) external view validRequest(requestId) returns (VerificationResult[] memory) {
        VerificationRequest memory request = verificationRequests[requestId];
        require(request.isCompleted, "Verification not completed yet");
        
        return verificationResults[requestId];
    }
    
    function getEmployerRequests(address employer) external view returns (string[] memory) {
        return employerRequests[employer];
    }
    
    function getCandidateRequests(string memory candidateDID) external view returns (string[] memory) {
        return candidateRequests[candidateDID];
    }
}
