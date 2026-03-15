'use client'

import { useState, useEffect, useCallback } from 'react'
import { Shield, Award, Plus, Check, Lock, Terminal } from 'lucide-react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import toast from 'react-hot-toast'
import {
  useHasDID,
  useGetDID,
  useCreateDID,
  useGetCredentials,
  useGetCredential,
  useIssueCredential,
  useRegisterIssuer,
  useIsAuthorizedIssuer,
} from '../hooks/useContracts'

export default function Dashboard() {
  const { address, isConnected } = useAccount()

  // DID state
  const [didId, setDidId] = useState('')
  const [showCreateDID, setShowCreateDID] = useState(false)
  const [newDIDForm, setNewDIDForm] = useState({
    didId: '',
    serviceEndpoint: ''
  })

  // Credential state
  const [showIssueCredential, setShowIssueCredential] = useState(false)
  const [newCredentialForm, setNewCredentialForm] = useState({
    credentialId: '',
    holderDID: '',
    credentialType: '',
    credentialData: '',
    expirationDate: '0'
  })

  // Generate DID based on full wallet address
  useEffect(() => {
    if (address) {
      const userDID = `did:eth:${address}`
      setDidId(userDID)
    }
  }, [address])

  // Contract hooks
  const { exists: hasDID } = useHasDID(didId)
  const { didDocument, isLoading: isLoadingDID } = useGetDID(hasDID ? didId : undefined)
  const { createDID, isPending: isCreatingDID } = useCreateDID()
  const { credentialIds, isLoading: isLoadingCredentials, refetch: refetchCredentials } = useGetCredentials(hasDID ? didId : undefined)
  const { issueCredential, isPending: isIssuingCredential } = useIssueCredential()
  const { registerIssuer, isPending: isRegisteringIssuer } = useRegisterIssuer()
  const { isAuthorized } = useIsAuthorizedIssuer(address)

  // Close modal on ESC key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowCreateDID(false)
      setShowIssueCredential(false)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Handle DID creation
  const handleCreateDID = async () => {
    const trimmedDID = newDIDForm.didId.trim()
    const trimmedEndpoint = newDIDForm.serviceEndpoint.trim()

    if (!trimmedDID || !trimmedEndpoint) {
      toast.error('All fields required')
      return
    }

    try {
      await createDID(trimmedDID, trimmedEndpoint)
      toast.success('DID creation submitted')
      setShowCreateDID(false)
      setNewDIDForm({ didId: '', serviceEndpoint: '' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DID creation failed'
      toast.error(message.length > 100 ? 'DID creation failed' : message)
    }
  }

  // Handle issuer registration
  const handleRegisterIssuer = async () => {
    if (!address) return

    try {
      await registerIssuer(address, 'My Institution')
      toast.success('Issuer registration submitted')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed'
      toast.error(message.length > 100 ? 'Registration failed' : message)
    }
  }

  // Handle credential issuance
  const handleIssueCredential = async () => {
    const trimmedId = newCredentialForm.credentialId.trim()
    const trimmedDID = newCredentialForm.holderDID.trim()
    const trimmedType = newCredentialForm.credentialType.trim()

    if (!trimmedId || !trimmedDID || !trimmedType) {
      toast.error('Required fields missing')
      return
    }

    let expiration: bigint
    try {
      const parsed = Number(newCredentialForm.expirationDate)
      if (isNaN(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
        toast.error('Expiration must be a non-negative integer')
        return
      }
      expiration = BigInt(parsed)
    } catch {
      toast.error('Invalid expiration date')
      return
    }

    try {
      await issueCredential(
        trimmedId,
        trimmedDID,
        trimmedType,
        newCredentialForm.credentialData.trim(),
        expiration
      )
      toast.success('Credential issuance submitted')
      setShowIssueCredential(false)
      setNewCredentialForm({
        credentialId: '',
        holderDID: '',
        credentialType: '',
        credentialData: '',
        expirationDate: '0'
      })
      setTimeout(() => refetchCredentials(), 2000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Issuance failed'
      toast.error(message.length > 100 ? 'Issuance failed' : message)
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-black grid-bg scanline flex items-center justify-center">
        <div className="text-center">
          <div className="mb-8">
            <div className="text-6xl font-bold text-green-400 mb-4 text-glitch crypto-glitch">
              [CREDENTIAL_VAULT]
            </div>
            <div className="text-sm text-green-400 opacity-70 font-mono">
              &gt; BLOCKCHAIN IDENTITY VERIFICATION SYSTEM v2.0
            </div>
            <div className="text-sm text-green-400 opacity-50 font-mono mt-2">
              &gt; CRYPTOGRAPHIC AUTHENTICATION REQUIRED
            </div>
          </div>

          <div className="cyber-glow bg-black bg-opacity-50 p-8 rounded-none max-w-md mx-auto">
            <div className="flex items-center justify-center mb-6">
              <Lock className="w-12 h-12 text-green-400" aria-hidden="true" />
            </div>
            <div className="text-green-400 mb-6 font-mono">
              [!] WALLET CONNECTION REQUIRED
            </div>
            <ConnectButton />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black grid-bg scanline">
      {/* Header */}
      <header className="border-b border-green-400 bg-black bg-opacity-90">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Terminal className="w-6 h-6 text-green-400" aria-hidden="true" />
            <div className="font-mono">
              <span className="text-green-400">&gt;</span>
              <span className="text-green-400 ml-2 font-bold">[CREDENTIAL_VAULT]</span>
            </div>
          </div>
          <ConnectButton />
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-8">
        {/* Terminal Header */}
        <div className="mb-8 font-mono">
          <div className="text-green-400 text-sm mb-2">&gt; SYSTEM STATUS</div>
          <div className="text-2xl text-green-400 font-bold cursor-blink crypto-glitch">DASHBOARD</div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="cyber-glow bg-black bg-opacity-80 p-6">
            <div className="flex items-center justify-between">
              <div className="font-mono">
                <div className="text-xs text-green-400 opacity-70 mb-1">[DID_STATUS]</div>
                <div className="text-xl text-green-400 font-bold">
                  {isLoadingDID ? '... LOADING' : hasDID ? 'ACTIVE' : 'NONE'}
                </div>
              </div>
              <Shield className={`w-8 h-8 ${hasDID ? 'text-green-400' : 'text-gray-600'}`} aria-hidden="true" />
            </div>
          </div>

          <div className="cyber-glow-blue bg-black bg-opacity-80 p-6">
            <div className="flex items-center justify-between">
              <div className="font-mono">
                <div className="text-xs text-cyan-400 opacity-70 mb-1">[CREDENTIALS]</div>
                <div className="text-xl text-cyan-400 font-bold">
                  {isLoadingCredentials ? '... LOADING' : `${credentialIds?.length || 0} TOTAL`}
                </div>
              </div>
              <Award className="w-8 h-8 text-cyan-400" aria-hidden="true" />
            </div>
          </div>

          <div className="cyber-glow bg-black bg-opacity-80 p-6">
            <div className="flex items-center justify-between">
              <div className="font-mono">
                <div className="text-xs text-green-400 opacity-70 mb-1">[ISSUER]</div>
                <div className="text-xl text-green-400 font-bold">
                  {isAuthorized ? 'AUTH' : 'UNAUTH'}
                </div>
              </div>
              <Check className={`w-8 h-8 ${isAuthorized ? 'text-green-400' : 'text-gray-600'}`} aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* DID Section */}
        {!hasDID ? (
          <div className="neon-border bg-black bg-opacity-80 p-6 mb-8">
            <div className="font-mono">
              <div className="text-green-400 mb-4">
                <div className="text-sm opacity-70 mb-2">[!] DECENTRALIZED IDENTITY NOT FOUND</div>
                <div className="text-xs opacity-50">Initialize DID to access credential system</div>
              </div>
              <button
                onClick={() => {
                  setNewDIDForm({
                    didId: didId,
                    serviceEndpoint: 'https://credential-vault.app'
                  })
                  setShowCreateDID(true)
                }}
                className="cyber-glow bg-black text-green-400 px-6 py-2 font-mono text-sm hover:bg-green-900 hover:bg-opacity-20 transition-all"
              >
                [+] INITIALIZE_DID
              </button>
            </div>
          </div>
        ) : (
          <div className="cyber-glow bg-black bg-opacity-80 p-6 mb-8 font-mono">
            <div className="text-green-400 text-sm mb-4 opacity-70">[DECENTRALIZED_IDENTITY]</div>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-green-400 opacity-70">&gt; DID:</span>
                <div className="text-green-400 mt-1 ml-4">{didId}</div>
              </div>
              {didDocument && (
                <>
                  <div>
                    <span className="text-green-400 opacity-70">&gt; CONTROLLER:</span>
                    <div className="text-green-400 mt-1 ml-4 break-all">{didDocument.controller}</div>
                  </div>
                  <div>
                    <span className="text-green-400 opacity-70">&gt; STATUS:</span>
                    <div className="text-green-400 mt-1 ml-4">{didDocument.active ? 'ACTIVE' : 'DEACTIVATED'}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Issuer Registration */}
        {hasDID && !isAuthorized && (
          <div className="neon-border bg-black bg-opacity-80 p-6 mb-8 font-mono">
            <div className="text-green-400 text-sm mb-4 opacity-70">[ISSUER_AUTHORIZATION]</div>
            <div className="text-green-400 text-xs mb-4 opacity-50">
              Register as authorized credential issuer (admin only)
            </div>
            <button
              onClick={handleRegisterIssuer}
              disabled={isRegisteringIssuer}
              className="cyber-glow bg-black text-green-400 px-6 py-2 text-sm hover:bg-green-900 hover:bg-opacity-20 disabled:opacity-30"
            >
              {isRegisteringIssuer ? '[...PROCESSING]' : '[+] REGISTER_ISSUER'}
            </button>
          </div>
        )}

        {/* Issue Credential */}
        {isAuthorized && (
          <div className="cyber-glow-blue bg-black bg-opacity-80 p-6 mb-8 font-mono">
            <div className="flex justify-between items-center mb-4">
              <div className="text-cyan-400 text-sm opacity-70">[CREDENTIAL_ISSUANCE]</div>
              <button
                onClick={() => setShowIssueCredential(!showIssueCredential)}
                className="cyber-glow-blue bg-black text-cyan-400 px-4 py-2 text-xs hover:bg-cyan-900 hover:bg-opacity-20"
              >
                [+] NEW_CREDENTIAL
              </button>
            </div>

            {showIssueCredential && (
              <div className="border-t border-cyan-400 border-opacity-30 pt-4 space-y-3">
                <input
                  aria-label="Credential ID"
                  placeholder="CREDENTIAL_ID"
                  className="w-full bg-black border border-cyan-400 text-cyan-400 px-3 py-2 text-sm focus:outline-none focus:border-cyan-300"
                  value={newCredentialForm.credentialId}
                  onChange={(e) => setNewCredentialForm({ ...newCredentialForm, credentialId: e.target.value })}
                />
                <input
                  aria-label="Holder DID"
                  placeholder="HOLDER_DID"
                  className="w-full bg-black border border-cyan-400 text-cyan-400 px-3 py-2 text-sm focus:outline-none focus:border-cyan-300"
                  value={newCredentialForm.holderDID}
                  onChange={(e) => setNewCredentialForm({ ...newCredentialForm, holderDID: e.target.value })}
                />
                <input
                  aria-label="Credential Type"
                  placeholder="CREDENTIAL_TYPE"
                  className="w-full bg-black border border-cyan-400 text-cyan-400 px-3 py-2 text-sm focus:outline-none focus:border-cyan-300"
                  value={newCredentialForm.credentialType}
                  onChange={(e) => setNewCredentialForm({ ...newCredentialForm, credentialType: e.target.value })}
                />
                <textarea
                  aria-label="Credential Data"
                  placeholder='CREDENTIAL_DATA (JSON)'
                  className="w-full bg-black border border-cyan-400 text-cyan-400 px-3 py-2 text-sm h-24 focus:outline-none focus:border-cyan-300"
                  value={newCredentialForm.credentialData}
                  onChange={(e) => setNewCredentialForm({ ...newCredentialForm, credentialData: e.target.value })}
                />
                <input
                  aria-label="Expiration Date"
                  placeholder="EXPIRATION (0 = NEVER)"
                  type="number"
                  min="0"
                  step="1"
                  className="w-full bg-black border border-cyan-400 text-cyan-400 px-3 py-2 text-sm focus:outline-none focus:border-cyan-300"
                  value={newCredentialForm.expirationDate}
                  onChange={(e) => setNewCredentialForm({ ...newCredentialForm, expirationDate: e.target.value })}
                />
                <button
                  onClick={handleIssueCredential}
                  disabled={isIssuingCredential}
                  className="w-full cyber-glow-blue bg-black text-cyan-400 px-4 py-2 text-sm hover:bg-cyan-900 hover:bg-opacity-20 disabled:opacity-30"
                >
                  {isIssuingCredential ? '[...ISSUING]' : '[EXECUTE] ISSUE_CREDENTIAL'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Credentials List */}
        <div className="cyber-glow bg-black bg-opacity-80 p-6 font-mono">
          <div className="text-green-400 text-sm mb-4 opacity-70">[VERIFIED_CREDENTIALS]</div>

          {!hasDID ? (
            <div className="text-green-400 opacity-50 text-xs">&gt; Initialize DID to view credentials</div>
          ) : isLoadingCredentials ? (
            <div className="text-green-400 opacity-50 text-xs">&gt; Loading credentials...</div>
          ) : credentialIds && credentialIds.length > 0 ? (
            <div className="space-y-4">
              {credentialIds.map((credId) => (
                <CredentialCard key={credId} credentialId={credId} />
              ))}
            </div>
          ) : (
            <div className="text-green-400 opacity-50 text-xs">&gt; No credentials found in registry</div>
          )}
        </div>

        {/* Create DID Modal */}
        {showCreateDID && (
          <div
            className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center p-4 z-50"
            onClick={(e) => { if (e.target === e.currentTarget) setShowCreateDID(false) }}
            role="dialog"
            aria-modal="true"
            aria-label="Create Decentralized Identity"
          >
            <div className="cyber-glow bg-black p-6 max-w-md w-full font-mono">
              <div className="text-green-400 text-sm mb-6 opacity-70">[CREATE_DECENTRALIZED_IDENTITY]</div>
              <div className="space-y-4">
                <input
                  aria-label="DID ID"
                  placeholder="DID_ID"
                  className="w-full bg-black border border-green-400 text-green-400 px-3 py-2 text-sm focus:outline-none focus:border-green-300"
                  value={newDIDForm.didId}
                  onChange={(e) => setNewDIDForm({ ...newDIDForm, didId: e.target.value })}
                />
                <input
                  aria-label="Service Endpoint"
                  placeholder="SERVICE_ENDPOINT"
                  className="w-full bg-black border border-green-400 text-green-400 px-3 py-2 text-sm focus:outline-none focus:border-green-300"
                  value={newDIDForm.serviceEndpoint}
                  onChange={(e) => setNewDIDForm({ ...newDIDForm, serviceEndpoint: e.target.value })}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateDID}
                    disabled={isCreatingDID}
                    className="flex-1 cyber-glow bg-black text-green-400 px-4 py-2 text-sm hover:bg-green-900 hover:bg-opacity-20 disabled:opacity-30"
                  >
                    {isCreatingDID ? '[...CREATING]' : '[EXECUTE]'}
                  </button>
                  <button
                    onClick={() => setShowCreateDID(false)}
                    className="flex-1 border border-green-400 border-opacity-30 bg-black text-green-400 opacity-70 px-4 py-2 text-sm hover:opacity-100"
                  >
                    [CANCEL]
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CredentialCard({ credentialId }: { credentialId: string }) {
  const { credential, isLoading } = useGetCredential(credentialId)

  if (isLoading) {
    return (
      <div className="cyber-glow bg-black bg-opacity-60 p-4 font-mono animate-pulse">
        <div className="text-green-400 opacity-50 text-xs">&gt; Loading credential...</div>
      </div>
    )
  }

  if (!credential) return null

  const isValid = !credential.isRevoked

  return (
    <div className={`${isValid ? 'cyber-glow' : 'cyber-glow-red'} bg-black bg-opacity-60 p-4 font-mono`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className={`text-sm font-bold mb-2 ${isValid ? 'text-green-400' : 'text-red-400'}`}>
            {credential.credentialType}
          </div>
          <div className={`text-xs mb-2 ${isValid ? 'text-green-400' : 'text-red-400'} opacity-70`}>
            &gt; ISSUER: {credential.institutionName}
          </div>
          <div className={`text-xs mb-2 ${isValid ? 'text-green-400' : 'text-red-400'} opacity-50`}>
            &gt; ID: {credentialId}
          </div>
          <div className={`text-xs ${isValid ? 'text-green-400' : 'text-red-400'} opacity-90 break-all`}>
            &gt; DATA: {credential.credentialData}
          </div>
        </div>
        <div className="ml-4">
          <span className={`px-3 py-1 text-xs font-bold ${
            isValid
              ? 'bg-green-900 bg-opacity-30 text-green-400 border border-green-400'
              : 'bg-red-900 bg-opacity-30 text-red-400 border border-red-400'
          }`}>
            {isValid ? 'VALID' : 'REVOKED'}
          </span>
        </div>
      </div>
    </div>
  )
}
