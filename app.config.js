const fs = require('fs');
const path = require('path');

/**
 * Dynamic layer over app.json (which stays the source of truth for everything else).
 *
 * Android push needs Firebase's google-services.json in the build, but the file holds project
 * keys, so it isn't committed: EAS builds get it from the GOOGLE_SERVICES_JSON "file" environment
 * variable (`eas env:create --type file --name GOOGLE_SERVICES_JSON ...`), which is the path to
 * the uploaded copy. A local ./google-services.json is used when present; otherwise the field
 * stays unset so local builds without Firebase still work (only push is missing then).
 */
module.exports = ({ config }) => {
  const localFile = path.join(__dirname, 'google-services.json');
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(localFile) ? './google-services.json' : undefined);

  if (!googleServicesFile) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile },
  };
};
