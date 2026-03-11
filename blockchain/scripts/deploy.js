const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n🚀 Starting deployment to local network...\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Deploy DIDRegistry
  console.log("📜 Deploying DIDRegistry...");
  const DIDRegistry = await hre.ethers.getContractFactory("DIDRegistry");
  const didRegistry = await DIDRegistry.deploy();
  await didRegistry.waitForDeployment();
  const didRegistryAddress = await didRegistry.getAddress();
  console.log("✅ DIDRegistry deployed to:", didRegistryAddress);

  // Deploy CredentialIssuer (requires DIDRegistry address for DID validation)
  console.log("\n📜 Deploying CredentialIssuer...");
  const CredentialIssuer = await hre.ethers.getContractFactory("CredentialIssuer");
  const credentialIssuer = await CredentialIssuer.deploy(didRegistryAddress);
  await credentialIssuer.waitForDeployment();
  const credentialIssuerAddress = await credentialIssuer.getAddress();
  console.log("✅ CredentialIssuer deployed to:", credentialIssuerAddress);

  // Deploy CredentialVerifier
  console.log("\n📜 Deploying CredentialVerifier...");
  const CredentialVerifier = await hre.ethers.getContractFactory("CredentialVerifier");
  const credentialVerifier = await CredentialVerifier.deploy(didRegistryAddress, credentialIssuerAddress);
  await credentialVerifier.waitForDeployment();
  const credentialVerifierAddress = await credentialVerifier.getAddress();
  console.log("✅ CredentialVerifier deployed to:", credentialVerifierAddress);

  // Prepare deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      DIDRegistry: {
        address: didRegistryAddress,
        blockNumber: await hre.ethers.provider.getBlockNumber()
      },
      CredentialIssuer: {
        address: credentialIssuerAddress,
        blockNumber: await hre.ethers.provider.getBlockNumber()
      },
      CredentialVerifier: {
        address: credentialVerifierAddress,
        blockNumber: await hre.ethers.provider.getBlockNumber()
      }
    }
  };

  // Save deployment info
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n💾 Deployment info saved to:", deploymentFile);

  // Copy ABIs to a convenient location
  const abisDir = path.join(__dirname, "../deployments/abis");
  if (!fs.existsSync(abisDir)) {
    fs.mkdirSync(abisDir, { recursive: true });
  }

  // Copy contract ABIs
  const contracts = ["DIDRegistry", "CredentialIssuer", "CredentialVerifier"];
  for (const contractName of contracts) {
    const artifactPath = path.join(__dirname, `../artifacts/contracts/${contractName}.sol/${contractName}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const abiPath = path.join(abisDir, `${contractName}.json`);
    fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
    console.log(`📋 ${contractName} ABI saved to: deployments/abis/${contractName}.json`);
  }

  // Create a frontend-ready config file
  const frontendConfig = {
    chainId: hre.network.config.chainId,
    contracts: {
      DIDRegistry: {
        address: didRegistryAddress,
        abi: JSON.parse(fs.readFileSync(path.join(abisDir, "DIDRegistry.json"), "utf8"))
      },
      CredentialIssuer: {
        address: credentialIssuerAddress,
        abi: JSON.parse(fs.readFileSync(path.join(abisDir, "CredentialIssuer.json"), "utf8"))
      },
      CredentialVerifier: {
        address: credentialVerifierAddress,
        abi: JSON.parse(fs.readFileSync(path.join(abisDir, "CredentialVerifier.json"), "utf8"))
      }
    }
  };

  const frontendConfigPath = path.join(deploymentsDir, "frontend-config.json");
  fs.writeFileSync(frontendConfigPath, JSON.stringify(frontendConfig, null, 2));
  console.log(`\n🎨 Frontend config saved to: deployments/frontend-config.json`);

  console.log("\n✨ Deployment Summary:");
  console.log("=".repeat(60));
  console.log(`Network: ${hre.network.name} (Chain ID: ${hre.network.config.chainId})`);
  console.log(`DIDRegistry:         ${didRegistryAddress}`);
  console.log(`CredentialIssuer:    ${credentialIssuerAddress}`);
  console.log(`CredentialVerifier:  ${credentialVerifierAddress}`);
  console.log("=".repeat(60));
  console.log("\n🎉 All contracts deployed successfully!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
