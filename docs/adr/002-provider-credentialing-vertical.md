# ADR-002: Provider Credentialing Vertical

## Status
Proposed

---

## 7. Provider Credentialing as First Vertical

### Context
The three-contract architecture (DIDRegistry, CredentialIssuer, CredentialVerifier) is general-purpose by design -- it can verify any type of credential. However, a general-purpose system without a specific market is difficult to sell and harder to validate. The system needs a concrete first use case that maps naturally to the existing architecture and addresses a painful, measurable problem.

Medical provider credentialing -- the process of verifying a doctor's licenses, degrees, board certifications, DEA registration, and malpractice insurance before they can practice at a hospital -- is one of the most broken verification workflows in any industry. The current process is almost entirely manual: hospital credentialing staff contact each primary source (state medical board, university, certification body, insurance carrier) individually by phone, fax, or web portal. This takes 90 to 180 days per provider. Delays cost hospitals revenue (unfilled positions) and cost providers income (they cannot practice until cleared).

### Decision
Target medical provider credentialing as the first real-world application of the Credential Vault protocol.

The existing architecture maps directly to this domain without modification:

- **DIDRegistry** = provider identity. Each doctor gets a DID linked to their wallet.
- **CredentialIssuer** = primary sources. State medical boards, universities, ABMS member boards, and insurance carriers are registered as authorized issuers and mint verifiable credentials on-chain.
- **CredentialVerifier** = hospitals and health systems. They request verification of a provider's credentials, the provider approves, and the system cross-references all primary sources in seconds.

Additional architectural fit:

- The consent-gated verification workflow (ADR-001, Decision 4) maps to the existing requirement that providers authorize release of their credentialing information.
- `wasKeyValidAt()` from DIDRegistry v2 provides historical credential proof -- the ability to verify that a provider held a valid license at a specific point in time. No existing credentialing system offers this capability.
- Provider credentials (medical licenses, board certifications) are semi-public professional records, not Protected Health Information. This significantly reduces the HIPAA compliance surface for the initial deployment.

The business model is B2B: hospitals, health systems, and medical staffing agencies are the buyers. They currently pay Credentialing Verification Organizations (CVOs) per provider, per cycle.

### Consequences
- Provides a concrete, high-value market to validate the protocol against real-world requirements.
- The 90-to-180-day manual process creates strong buyer motivation -- the pain is measurable in dollars and days.
- B2B sales cycles in healthcare are long (6-18 months) and require compliance certifications, security audits, and legal review.
- The system must eventually support healthcare-specific standards (NCQA, Joint Commission, CMS requirements) that do not exist in the current implementation.
- Choosing a regulated industry as the first vertical increases the compliance burden compared to less regulated alternatives (e.g., tech certifications).
- Success in provider credentialing does not guarantee transferability to other verticals -- domain-specific features may be needed.

---

## 8. No PHI/PII On-Chain

### Context
Public blockchains are immutable and transparent by design. Every transaction and every piece of stored data is permanently visible to anyone. This is fundamentally incompatible with privacy regulations that require the ability to delete personal data (GDPR Article 17, HIPAA right to amendment/restriction). Storing Protected Health Information or Personally Identifiable Information on a public blockchain would create an irreconcilable legal conflict: the data cannot be deleted, but the law requires deletion on request.

This is not a theoretical concern. A single instance of PHI on an immutable public ledger would constitute a permanent, unremediable HIPAA violation.

### Decision
Protected Health Information and Personally Identifiable Information must never be stored on a public blockchain. This is a non-negotiable legal requirement, not a design preference.

**On-chain (public, immutable, auditable):**
- Decentralized identifiers (DIDs) -- pseudonymous, not directly identifying
- Access control records (who can issue, who can verify)
- Consent management (verification request/approval workflow)
- Audit trail (timestamps, transaction hashes, event logs)
- Credential integrity hashes (cryptographic proof that off-chain data has not been tampered with)

**Off-chain (encrypted, access-controlled, deletable):**
- Actual PHI/PII data (names, dates of birth, SSNs, license numbers)
- Credential document content and metadata
- Any data that could directly or indirectly identify a patient or provider

The on-chain credential hash allows anyone with the off-chain data to verify its integrity against the blockchain record, without the blockchain itself containing any sensitive information.

### Consequences
- The system can operate within HIPAA and GDPR requirements without architectural contradictions.
- Requires building or integrating an off-chain encrypted storage layer (not yet implemented).
- On-chain verification alone cannot reveal credential content -- the verifier needs access to the off-chain data plus the on-chain hash for full verification.
- Adds architectural complexity: two storage layers must be kept in sync, and the off-chain layer becomes a critical dependency.
- The on-chain audit trail remains valuable even without on-chain content -- it proves when a credential was issued, by whom, and whether it has been revoked.
- Off-chain storage introduces availability concerns that on-chain-only storage would not have.

---

## 9. CVO-to-Protocol Adoption Strategy

### Context
Blockchain-based credentialing faces a chicken-and-egg problem. Hospitals will not adopt a verification system that has no credentials to verify. Primary sources (state medical boards, universities, certification bodies) will not invest in on-chain issuance until hospitals are using the system. Neither side moves first.

Existing Credentialing Verification Organizations (CVOs) solve the same fundamental problem -- verifying provider credentials -- but do it manually. They already have relationships with both primary sources and hospitals.

### Decision
Adopt a phased strategy that starts as a CVO using its own protocol and transitions to a pure infrastructure layer over time.

**Phase 1: CVO with on-chain backend.** Operate as a credentialing verification organization that happens to use blockchain infrastructure internally. Manually verify provider credentials through traditional channels (primary source contact), then mint verified credentials on-chain. The blockchain is an implementation detail at this stage -- hospitals interact with the CVO through familiar interfaces.

**Phase 2: Prove value with one customer.** Partner with a single hospital or medical staffing agency. Demonstrate measurable reduction in credentialing cycle time. Produce a case study with concrete numbers (days saved, cost reduction, error rate improvement).

**Phase 3: Primary source direct issuance.** With a proven track record and active hospital customers, approach primary sources about issuing credentials directly on-chain. State medical boards and certification bodies begin minting credentials without CVO intermediation.

**Phase 4: Protocol layer.** Transition from operating as a CVO to providing the infrastructure that CVOs, hospitals, and primary sources use directly. The protocol becomes the standard, and the organization maintains the contracts, tooling, and governance.

### Consequences
- Solves the cold-start problem by bootstrapping both supply (credentials) and demand (verifiers) through CVO operations.
- Phase 1 generates revenue immediately through traditional CVO fees, funding further development.
- Operating as a CVO requires domain expertise in provider credentialing, compliance knowledge, and primary source relationships -- this is operational work, not just software development.
- The manual verification step in Phase 1 means the system is not fully decentralized initially. Decentralization increases as primary sources begin issuing directly.
- Transition from Phase 1 to Phase 3 may take years. Primary sources are typically government agencies or large institutions with slow technology adoption cycles.
- Risk of getting stuck at Phase 1: if the CVO business is profitable, there may be reduced incentive to pursue the harder protocol transition.

---

## 10. W3C DID/VC Alignment Planned

### Context
The current DID implementation uses a custom format. DID identifiers are arbitrary strings, and credential structures are application-specific. This works for a closed system but creates interoperability barriers in a B2B context. Hospitals, primary sources, and other CVOs will expect standard formats that integrate with their existing systems and with credentials issued by other parties.

The W3C has published two relevant specifications: Decentralized Identifiers (DIDs) v1.0 and Verifiable Credentials Data Model v2.0. These are the emerging industry standards for decentralized identity and credential representation. Several healthcare-specific initiatives (DirectTrust, SMART Health Cards) are building on these standards.

### Decision
Adopt W3C DID and Verifiable Credentials standards before building provider-credentialing-specific features. The current custom format should be refactored to align with:

- **W3C DID Core v1.0** -- DID syntax (`did:method:identifier`), DID document structure, verification methods, service endpoints.
- **W3C Verifiable Credentials Data Model v2.0** -- Credential structure, proof formats, credential status (revocation), presentation exchange.

This means defining a DID method (e.g., `did:vault:` or a more specific method name), structuring DID documents according to the W3C schema, and representing credentials as Verifiable Credentials with standard proof types.

### Consequences
- Credentials issued by the system will be interoperable with other W3C-compliant systems.
- B2B customers (hospitals, health systems) can integrate using standard libraries and tooling rather than custom adapters.
- Refactoring the DID format and credential structure now, before building domain-specific features, avoids a much more painful migration later when there is production data to migrate.
- W3C compliance adds implementation complexity -- the specifications are detailed and include requirements around JSON-LD contexts, proof suites, and resolution protocols.
- The DIDRegistry contract interface will need changes. The `didId` parameter format, DID document structure, and key representation must align with the specification.
- Not all parts of the W3C specifications are relevant on-chain. The contract will implement a subset, with full compliance handled at the application layer.
- Status is planned, not yet implemented. No timeline committed.
