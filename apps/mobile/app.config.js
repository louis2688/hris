// Per-company builds: APP_ID=com.acme.hris APP_NAME="Acme HR" eas build ... (defaults come from app.json).
module.exports = ({ config }) => {
  const id = process.env.APP_ID;
  return {
    ...config,
    name: process.env.APP_NAME ?? config.name,
    ios: { ...config.ios, bundleIdentifier: id ?? config.ios.bundleIdentifier },
    android: { ...config.android, package: id ?? config.android.package },
  };
};
