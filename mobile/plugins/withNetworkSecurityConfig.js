const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Custom Expo config plugin to inject Network Security Configuration
 * Fixes "CLEARTEXT communication not permitted" error in production APKs
 */
const withNetworkSecurityConfig = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

    // Set the networkSecurityConfig attribute on the <application> tag
    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';

    // Copy the network security config XML to the Android resources folder
    // This will be done by Expo's prebuild process
    return config;
  });
};

/**
 * Also ensure the XML file gets copied to android/app/src/main/res/xml/
 * This plugin handles both the AndroidManifest injection and file copying
 */
const withNetworkSecurityConfigFile = (config) => {
  const { withDangerousMod } = require('@expo/config-plugins');
  
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const sourceFile = path.join(projectRoot, 'android-network-security-config.xml');
      const androidResPath = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      const targetFile = path.join(androidResPath, 'network_security_config.xml');

      // Ensure the xml directory exists
      if (!fs.existsSync(androidResPath)) {
        fs.mkdirSync(androidResPath, { recursive: true });
      }

      // Copy the network security config file
      if (fs.existsSync(sourceFile)) {
        fs.copyFileSync(sourceFile, targetFile);
        console.log('✅ Network Security Config file copied to android/app/src/main/res/xml/');
      } else {
        console.warn('⚠️  Warning: android-network-security-config.xml not found in project root');
      }

      return config;
    },
  ]);
};

module.exports = (config) => {
  config = withNetworkSecurityConfig(config);
  config = withNetworkSecurityConfigFile(config);
  return config;
};
