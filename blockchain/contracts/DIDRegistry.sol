// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title DIDRegistry
 * @dev Manages decentralized identities (DIDs) linked to wallet addresses.
 *      Features: multi-key architecture (authentication + delegation keys),
 *      key rotation with historical validity queries, reverse lookups,
 *      nonce-based replay protection, and social recovery via guardian threshold.
 */
contract DIDRegistry {

    // --- Enums ---

    enum KeyType { Authentication, Delegation }
    enum RecoveryStatus { None, Pending, Executed, Cancelled }

    // --- Structs ---

    struct DIDKey {
        address keyAddress;
        KeyType keyType;
        bool active;
        uint256 addedAt;
        uint256 revokedAt;
    }

    struct DIDDocument {
        address controller;
        string serviceEndpoint;
        uint256 created;
        uint256 updated;
        bool active;
    }

    struct RecoveryRequest {
        address newController;
        uint256 initiatedAt;
        uint256 executeAfter;
        RecoveryStatus status;
        uint256 approvalCount;
        mapping(address => bool) hasApproved;
    }

    struct GuardianConfig {
        address[] guardians;
        mapping(address => bool) isGuardian;
        uint256 threshold;
    }

    // --- Events ---

    event DIDCreated(string indexed didId, address indexed controller, uint256 timestamp);
    event DIDUpdated(string indexed didId, address indexed controller, uint256 timestamp);
    event DIDDeactivated(string indexed didId, address indexed controller, uint256 timestamp);
    event DIDControllerTransferred(
        string indexed didId,
        address indexed oldController,
        address indexed newController,
        uint256 timestamp
    );
    event KeyAdded(string indexed didId, address indexed keyAddress, KeyType keyType, uint256 timestamp);
    event KeyRevoked(string indexed didId, address indexed keyAddress, KeyType keyType, uint256 timestamp);
    event NonceIncremented(string indexed didId, uint256 newNonce, uint256 timestamp);
    event GuardianAdded(string indexed didId, address indexed guardian, uint256 timestamp);
    event GuardianRemoved(string indexed didId, address indexed guardian, uint256 timestamp);
    event GuardianThresholdUpdated(string indexed didId, uint256 newThreshold, uint256 timestamp);
    event RecoveryInitiated(string indexed didId, address indexed newController, address indexed initiator, uint256 executeAfter, uint256 timestamp);
    event RecoveryApproved(string indexed didId, address indexed guardian, uint256 approvalCount, uint256 timestamp);
    event RecoveryExecuted(string indexed didId, address indexed oldController, address indexed newController, uint256 timestamp);
    event RecoveryCancelled(string indexed didId, address indexed cancelledBy, uint256 timestamp);

    // --- State ---

    mapping(string => DIDDocument) private documents;
    mapping(string => bool) public didExists;
    mapping(string => DIDKey[]) private didKeys;
    // keyIndex stores index+1 so that 0 means "not found" or "revoked"
    mapping(string => mapping(address => uint256)) private keyIndex;
    // Reverse lookup: one address can only control one active DID
    mapping(address => string) private addressToDID;
    // Nonce per DID for off-chain signature replay protection
    mapping(string => uint256) public nonces;
    // Recovery guardian configuration per DID
    mapping(string => GuardianConfig) private guardianConfigs;
    // Active recovery request per DID (only one at a time)
    mapping(string => RecoveryRequest) private recoveryRequests;

    // --- Constants ---

    uint256 public constant MAX_KEYS = 20;
    uint256 public constant MIN_GUARDIANS = 2;
    uint256 public constant MAX_GUARDIANS = 5;
    uint256 public constant RECOVERY_TIMELOCK = 48 hours;

    // --- Modifiers ---

    modifier onlyController(string memory didId) {
        require(didExists[didId], "DID does not exist");
        require(documents[didId].controller == msg.sender, "Only DID controller can perform this action");
        require(documents[didId].active, "DID is deactivated");
        _;
    }

    // --- DID Lifecycle ---

    /**
     * @dev Creates a new DID linked to the caller's address.
     *      The caller becomes the controller and is added as the first authentication key.
     *      Each address can only control one active DID.
     * @param didId Unique identifier for the DID (e.g. "did:vault:abc123")
     * @param serviceEndpoint Service endpoint URL for the DID
     */
    function createDID(string memory didId, string memory serviceEndpoint) external {
        require(bytes(didId).length > 0, "DID ID cannot be empty");
        require(!didExists[didId], "DID already exists");
        require(bytes(addressToDID[msg.sender]).length == 0, "Address already has a DID");

        documents[didId] = DIDDocument({
            controller: msg.sender,
            serviceEndpoint: serviceEndpoint,
            created: block.timestamp,
            updated: block.timestamp,
            active: true
        });

        didExists[didId] = true;
        addressToDID[msg.sender] = didId;

        _addKey(didId, msg.sender, KeyType.Authentication);

        emit DIDCreated(didId, msg.sender, block.timestamp);
    }

    /**
     * @dev Updates the service endpoint of an existing DID.
     * @param didId The DID to update
     * @param serviceEndpoint New service endpoint URL
     */
    function updateServiceEndpoint(string memory didId, string memory serviceEndpoint) external onlyController(didId) {
        documents[didId].serviceEndpoint = serviceEndpoint;
        documents[didId].updated = block.timestamp;

        emit DIDUpdated(didId, msg.sender, block.timestamp);
    }

    /**
     * @dev Permanently deactivates a DID. Revokes all keys, clears the reverse lookup,
     *      and cancels any pending recovery. Cannot be undone.
     * @param didId The DID to deactivate
     */
    function deactivateDID(string memory didId) external onlyController(didId) {
        documents[didId].active = false;
        documents[didId].updated = block.timestamp;

        // Revoke all active keys
        DIDKey[] storage keys = didKeys[didId];
        for (uint256 i = 0; i < keys.length; i++) {
            if (keys[i].active) {
                keys[i].active = false;
                keys[i].revokedAt = block.timestamp;
            }
        }

        // Cancel any pending recovery (FIX #6)
        RecoveryRequest storage request = recoveryRequests[didId];
        if (request.status == RecoveryStatus.Pending) {
            request.status = RecoveryStatus.Cancelled;
            emit RecoveryCancelled(didId, msg.sender, block.timestamp);
        }

        delete addressToDID[documents[didId].controller];

        emit DIDDeactivated(didId, msg.sender, block.timestamp);
    }

    /**
     * @dev Transfers DID controller to a new address. Revokes the old controller's
     *      auth key and adds a new one for the new controller. Updates reverse lookup.
     * @param didId The DID to transfer
     * @param newController The new controller address
     */
    function transferController(string memory didId, address newController) external onlyController(didId) {
        require(newController != address(0), "New controller cannot be zero address");
        require(newController != msg.sender, "New controller must be different");
        require(bytes(addressToDID[newController]).length == 0, "New controller already has a DID");

        address oldController = documents[didId].controller;

        // Cancel any pending recovery so the new controller doesn't inherit it (FIX #8)
        RecoveryRequest storage request = recoveryRequests[didId];
        if (request.status == RecoveryStatus.Pending) {
            request.status = RecoveryStatus.Cancelled;
            emit RecoveryCancelled(didId, msg.sender, block.timestamp);
        }

        documents[didId].controller = newController;
        documents[didId].updated = block.timestamp;

        // Update reverse lookup
        delete addressToDID[oldController];
        addressToDID[newController] = didId;

        // Rotate auth keys: revoke old, add new
        _revokeKeyByAddress(didId, oldController);
        _addKey(didId, newController, KeyType.Authentication);

        emit DIDControllerTransferred(didId, oldController, newController, block.timestamp);
    }

    // --- Key Management ---

    /**
     * @dev Adds a new key to the DID. Only the controller can add keys.
     *      If the address had a previously revoked key, a new entry is created
     *      (the old revoked entry is preserved for historical queries).
     * @param didId The DID to add a key to
     * @param keyAddress The address of the new key
     * @param keyType The type of key (Authentication or Delegation)
     */
    function addKey(string memory didId, address keyAddress, KeyType keyType) external onlyController(didId) {
        require(keyAddress != address(0), "Key address cannot be zero");

        // Allow re-adding if the previous key was revoked (FIX #2)
        uint256 existingIdx = keyIndex[didId][keyAddress];
        if (existingIdx > 0) {
            require(!didKeys[didId][existingIdx - 1].active, "Key already active for this DID");
        }

        _addKey(didId, keyAddress, keyType);
    }

    /**
     * @dev Revokes a key from the DID. Controller cannot revoke their own auth key
     *      (use transferController or deactivateDID instead).
     * @param didId The DID to revoke a key from
     * @param keyAddress The address of the key to revoke
     */
    function revokeKey(string memory didId, address keyAddress) external onlyController(didId) {
        require(keyAddress != msg.sender, "Cannot revoke own controller key");
        _revokeKeyByAddress(didId, keyAddress);
    }

    // --- View Functions ---

    /**
     * @dev Returns the DID document for a given DID.
     * @param didId The DID to look up
     * @return The DID document struct
     */
    function getDIDDocument(string memory didId) external view returns (DIDDocument memory) {
        require(didExists[didId], "DID does not exist");
        return documents[didId];
    }

    /**
     * @dev Checks whether a DID exists and is currently active (not deactivated).
     * @param didId The DID to check
     * @return True if the DID exists and is active
     */
    function isDIDActive(string memory didId) external view returns (bool) {
        if (!didExists[didId]) return false;
        return documents[didId].active;
    }

    /**
     * @dev Verifies that a given address is the active controller of a DID.
     *      Preserves the interface used by CredentialIssuer and CredentialVerifier.
     * @param didId The DID to check
     * @param controller The address to verify
     * @return True if the address is the active controller
     */
    function verifyDIDController(string memory didId, address controller) external view returns (bool) {
        if (!didExists[didId]) return false;
        return documents[didId].active && documents[didId].controller == controller;
    }

    /**
     * @dev Returns all keys (active and revoked) for a DID. Includes rotation history.
     * @param didId The DID to look up
     * @return Array of all DID keys
     */
    function getKeys(string memory didId) external view returns (DIDKey[] memory) {
        require(didExists[didId], "DID does not exist");
        return didKeys[didId];
    }

    /**
     * @dev Returns only the currently active keys of a given type.
     * @param didId The DID to look up
     * @param keyType The key type to filter by
     * @return Array of active keys matching the type
     */
    function getActiveKeysByType(string memory didId, KeyType keyType) external view returns (DIDKey[] memory) {
        require(didExists[didId], "DID does not exist");

        DIDKey[] storage keys = didKeys[didId];

        uint256 count = 0;
        for (uint256 i = 0; i < keys.length; i++) {
            if (keys[i].active && keys[i].keyType == keyType) {
                count++;
            }
        }

        DIDKey[] memory result = new DIDKey[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < keys.length; i++) {
            if (keys[i].active && keys[i].keyType == keyType) {
                result[j] = keys[i];
                j++;
            }
        }

        return result;
    }

    /**
     * @dev Checks whether an address has an active key of a specific type for a DID.
     * @param didId The DID to check
     * @param keyAddress The address to check
     * @param keyType The key type to check
     * @return True if the address has an active key of the given type
     */
    function hasActiveKey(string memory didId, address keyAddress, KeyType keyType) external view returns (bool) {
        uint256 idx = keyIndex[didId][keyAddress];
        if (idx == 0) return false;
        DIDKey storage key = didKeys[didId][idx - 1];
        return key.active && key.keyType == keyType;
    }

    /**
     * @dev Resolves an address to its associated DID. Returns empty string if none.
     * @param addr The address to look up
     * @return The DID identifier, or empty string
     */
    function resolveDID(address addr) external view returns (string memory) {
        return addressToDID[addr];
    }

    // --- Key History ---

    /**
     * @dev Checks whether a key was valid for a DID at a specific point in time.
     *      Scans the full key array to handle addresses that have been added and
     *      revoked multiple times. (FIX #3)
     * @param didId The DID to check
     * @param keyAddress The key address to check
     * @param timestamp The historical point in time
     * @return True if the key was active at the given timestamp
     */
    function wasKeyValidAt(string memory didId, address keyAddress, uint256 timestamp) external view returns (bool) {
        require(didExists[didId], "DID does not exist");

        DIDKey[] storage keys = didKeys[didId];
        for (uint256 i = 0; i < keys.length; i++) {
            if (keys[i].keyAddress != keyAddress) continue;

            if (timestamp < keys[i].addedAt) continue;
            if (keys[i].revokedAt > 0 && timestamp >= keys[i].revokedAt) continue;

            // Key was active at this timestamp
            return true;
        }

        return false;
    }

    // --- Nonce ---

    /**
     * @dev Increments the nonce for a DID. Used for off-chain signature replay protection.
     *      Only the controller can increment their DID's nonce.
     * @param didId The DID whose nonce to increment
     * @return The new nonce value
     */
    function incrementNonce(string memory didId) external onlyController(didId) returns (uint256) {
        nonces[didId]++;
        emit NonceIncremented(didId, nonces[didId], block.timestamp);
        return nonces[didId];
    }

    // --- Guardian Management ---

    /**
     * @dev Sets up recovery guardians and threshold for a DID. Can only be called once
     *      to set up, then use addGuardian/removeGuardian to modify.
     * @param didId The DID to configure guardians for
     * @param guardians Array of guardian addresses (2-5)
     * @param threshold Number of guardian approvals needed for recovery
     */
    function setupGuardians(
        string memory didId,
        address[] memory guardians,
        uint256 threshold
    ) external onlyController(didId) {
        require(guardianConfigs[didId].guardians.length == 0, "Guardians already configured");
        require(guardians.length >= MIN_GUARDIANS && guardians.length <= MAX_GUARDIANS, "Must have 2-5 guardians");
        require(threshold >= 2 && threshold <= guardians.length, "Threshold must be >= 2 and <= guardian count");

        GuardianConfig storage config = guardianConfigs[didId];
        config.threshold = threshold;

        for (uint256 i = 0; i < guardians.length; i++) {
            address guardian = guardians[i];
            require(guardian != address(0), "Guardian cannot be zero address");
            require(guardian != msg.sender, "Controller cannot be own guardian");
            require(!config.isGuardian[guardian], "Duplicate guardian");

            config.guardians.push(guardian);
            config.isGuardian[guardian] = true;

            emit GuardianAdded(didId, guardian, block.timestamp);
        }

        emit GuardianThresholdUpdated(didId, threshold, block.timestamp);
    }

    /**
     * @dev Adds a new guardian. Only controller can add, must not exceed MAX_GUARDIANS.
     * @param didId The DID to add a guardian to
     * @param guardian The guardian address to add
     */
    function addGuardian(string memory didId, address guardian) external onlyController(didId) {
        GuardianConfig storage config = guardianConfigs[didId];
        require(config.guardians.length > 0, "Guardians not configured");
        require(config.guardians.length < MAX_GUARDIANS, "Maximum guardians reached");
        require(guardian != address(0), "Guardian cannot be zero address");
        require(guardian != msg.sender, "Controller cannot be own guardian");
        require(!config.isGuardian[guardian], "Already a guardian");

        config.guardians.push(guardian);
        config.isGuardian[guardian] = true;

        emit GuardianAdded(didId, guardian, block.timestamp);
    }

    /**
     * @dev Removes a guardian. Must maintain minimum guardian count and threshold validity.
     *      If the guardian had approved a pending recovery, their vote is revoked. (FIX #4)
     * @param didId The DID to remove a guardian from
     * @param guardian The guardian address to remove
     */
    function removeGuardian(string memory didId, address guardian) external onlyController(didId) {
        GuardianConfig storage config = guardianConfigs[didId];
        require(config.isGuardian[guardian], "Not a guardian");
        require(config.guardians.length > MIN_GUARDIANS, "Cannot go below minimum guardians");
        require(config.guardians.length - 1 >= config.threshold, "Would invalidate threshold");

        config.isGuardian[guardian] = false;

        // Remove from array by swapping with last
        for (uint256 i = 0; i < config.guardians.length; i++) {
            if (config.guardians[i] == guardian) {
                config.guardians[i] = config.guardians[config.guardians.length - 1];
                config.guardians.pop();
                break;
            }
        }

        // Invalidate removed guardian's vote on pending recovery (FIX #4)
        RecoveryRequest storage request = recoveryRequests[didId];
        if (request.status == RecoveryStatus.Pending && request.hasApproved[guardian]) {
            request.hasApproved[guardian] = false;
            request.approvalCount--;
        }

        emit GuardianRemoved(didId, guardian, block.timestamp);
    }

    /**
     * @dev Updates the approval threshold for recovery.
     * @param didId The DID to update
     * @param newThreshold The new threshold value
     */
    function updateGuardianThreshold(string memory didId, uint256 newThreshold) external onlyController(didId) {
        GuardianConfig storage config = guardianConfigs[didId];
        require(config.guardians.length > 0, "Guardians not configured");
        require(newThreshold >= 2 && newThreshold <= config.guardians.length, "Invalid threshold");

        config.threshold = newThreshold;

        emit GuardianThresholdUpdated(didId, newThreshold, block.timestamp);
    }

    // --- Recovery ---

    /**
     * @dev Initiates a recovery request. Any guardian can initiate.
     *      The request enters a 48-hour time-lock before it can be executed.
     *      Previous approvals are explicitly cleared to prevent stale votes. (FIX #1)
     * @param didId The DID to recover
     * @param newController The proposed new controller address
     */
    function initiateRecovery(string memory didId, address newController) external {
        require(didExists[didId], "DID does not exist");
        require(documents[didId].active, "DID is deactivated");

        GuardianConfig storage config = guardianConfigs[didId];
        require(config.isGuardian[msg.sender], "Not a guardian of this DID");
        require(newController != address(0), "New controller cannot be zero address");
        require(newController != documents[didId].controller, "New controller must be different");
        require(bytes(addressToDID[newController]).length == 0, "New controller already has a DID");

        RecoveryRequest storage request = recoveryRequests[didId];
        require(
            request.status == RecoveryStatus.None ||
            request.status == RecoveryStatus.Cancelled ||
            request.status == RecoveryStatus.Executed,
            "Recovery already in progress"
        );

        // Clear all guardian approvals from any previous request (FIX #1)
        for (uint256 i = 0; i < config.guardians.length; i++) {
            request.hasApproved[config.guardians[i]] = false;
        }

        // Set up the new request
        request.newController = newController;
        request.initiatedAt = block.timestamp;
        request.executeAfter = block.timestamp + RECOVERY_TIMELOCK;
        request.status = RecoveryStatus.Pending;
        request.approvalCount = 1;

        // The initiating guardian automatically approves
        request.hasApproved[msg.sender] = true;

        emit RecoveryInitiated(didId, newController, msg.sender, request.executeAfter, block.timestamp);
        emit RecoveryApproved(didId, msg.sender, 1, block.timestamp);
    }

    /**
     * @dev Approves a pending recovery request. Each guardian can only approve once.
     * @param didId The DID with a pending recovery
     */
    function approveRecovery(string memory didId) external {
        require(didExists[didId], "DID does not exist");

        GuardianConfig storage config = guardianConfigs[didId];
        require(config.isGuardian[msg.sender], "Not a guardian of this DID");

        RecoveryRequest storage request = recoveryRequests[didId];
        require(request.status == RecoveryStatus.Pending, "No pending recovery");
        require(!request.hasApproved[msg.sender], "Already approved");

        request.hasApproved[msg.sender] = true;
        request.approvalCount++;

        emit RecoveryApproved(didId, msg.sender, request.approvalCount, block.timestamp);
    }

    /**
     * @dev Executes a recovery after the time-lock has passed and threshold is met.
     *      Any guardian can execute once conditions are met.
     *      Validates the DID is still active at execution time. (FIX #5)
     * @param didId The DID to recover
     */
    function executeRecovery(string memory didId) external {
        require(didExists[didId], "DID does not exist");
        require(documents[didId].active, "DID is deactivated");

        GuardianConfig storage config = guardianConfigs[didId];
        require(config.isGuardian[msg.sender], "Not a guardian of this DID");

        RecoveryRequest storage request = recoveryRequests[didId];
        require(request.status == RecoveryStatus.Pending, "No pending recovery");
        require(block.timestamp >= request.executeAfter, "Time-lock not expired");
        require(request.approvalCount >= config.threshold, "Insufficient guardian approvals");
        require(bytes(addressToDID[request.newController]).length == 0, "New controller already has a DID");

        address oldController = documents[didId].controller;
        address newController = request.newController;

        // Transfer control
        documents[didId].controller = newController;
        documents[didId].updated = block.timestamp;

        // Update reverse lookup
        delete addressToDID[oldController];
        addressToDID[newController] = didId;

        // Rotate auth keys
        _revokeKeyByAddress(didId, oldController);
        _addKey(didId, newController, KeyType.Authentication);

        // Remove new controller from guardian set if they were a guardian (FIX #10)
        if (config.isGuardian[newController]) {
            config.isGuardian[newController] = false;
            for (uint256 i = 0; i < config.guardians.length; i++) {
                if (config.guardians[i] == newController) {
                    config.guardians[i] = config.guardians[config.guardians.length - 1];
                    config.guardians.pop();
                    break;
                }
            }
            emit GuardianRemoved(didId, newController, block.timestamp);
        }

        request.status = RecoveryStatus.Executed;

        emit RecoveryExecuted(didId, oldController, newController, block.timestamp);
    }

    /**
     * @dev Cancels a pending recovery. Only the current controller can cancel.
     *      This is the controller's defense against malicious recovery attempts.
     * @param didId The DID with a pending recovery to cancel
     */
    function cancelRecovery(string memory didId) external onlyController(didId) {
        RecoveryRequest storage request = recoveryRequests[didId];
        require(request.status == RecoveryStatus.Pending, "No pending recovery to cancel");

        request.status = RecoveryStatus.Cancelled;

        emit RecoveryCancelled(didId, msg.sender, block.timestamp);
    }

    // --- Guardian Views ---

    /**
     * @dev Returns the guardian addresses and threshold for a DID.
     * @param didId The DID to look up
     * @return guardians Array of guardian addresses
     * @return threshold Number of approvals needed for recovery
     */
    function getGuardians(string memory didId) external view returns (address[] memory guardians, uint256 threshold) {
        require(didExists[didId], "DID does not exist");
        GuardianConfig storage config = guardianConfigs[didId];
        return (config.guardians, config.threshold);
    }

    /**
     * @dev Checks if an address is a guardian for a DID.
     * @param didId The DID to check
     * @param addr The address to check
     * @return True if the address is a guardian
     */
    function isGuardian(string memory didId, address addr) external view returns (bool) {
        return guardianConfigs[didId].isGuardian[addr];
    }

    /**
     * @dev Checks if a guardian has approved the current recovery request for a DID.
     * @param didId The DID to check
     * @param guardian The guardian address to check
     * @return True if the guardian has approved the pending recovery
     */
    function hasGuardianApproved(string memory didId, address guardian) external view returns (bool) {
        return recoveryRequests[didId].hasApproved[guardian];
    }

    /**
     * @dev Returns the status and details of a recovery request.
     * @param didId The DID to check
     * @return newController The proposed new controller
     * @return initiatedAt When the recovery was initiated
     * @return executeAfter When the time-lock expires
     * @return status The current status of the recovery
     * @return approvalCount Number of guardian approvals received
     */
    function getRecoveryRequest(string memory didId) external view returns (
        address newController,
        uint256 initiatedAt,
        uint256 executeAfter,
        RecoveryStatus status,
        uint256 approvalCount
    ) {
        RecoveryRequest storage request = recoveryRequests[didId];
        return (
            request.newController,
            request.initiatedAt,
            request.executeAfter,
            request.status,
            request.approvalCount
        );
    }

    // --- Internal ---

    /**
     * @dev Adds a key to the DID's key array. Enforces MAX_KEYS. (FIX #7)
     *      Updates keyIndex to point to the new entry (old revoked entries remain
     *      in the array for historical queries).
     */
    function _addKey(string memory didId, address keyAddress, KeyType keyType) internal {
        require(didKeys[didId].length < MAX_KEYS, "Maximum keys reached");

        didKeys[didId].push(DIDKey({
            keyAddress: keyAddress,
            keyType: keyType,
            active: true,
            addedAt: block.timestamp,
            revokedAt: 0
        }));

        keyIndex[didId][keyAddress] = didKeys[didId].length;

        emit KeyAdded(didId, keyAddress, keyType, block.timestamp);
    }

    /**
     * @dev Revokes a key by address. Clears keyIndex so the address can be
     *      re-added later. The revoked entry remains in the array for
     *      historical validity queries. (FIX #2)
     */
    function _revokeKeyByAddress(string memory didId, address keyAddress) internal {
        uint256 idx = keyIndex[didId][keyAddress];
        require(idx > 0, "Key not found");

        DIDKey storage key = didKeys[didId][idx - 1];
        require(key.active, "Key already revoked");

        key.active = false;
        key.revokedAt = block.timestamp;

        // Clear keyIndex so this address can be re-added (FIX #2)
        delete keyIndex[didId][keyAddress];

        emit KeyRevoked(didId, keyAddress, key.keyType, block.timestamp);
    }
}
