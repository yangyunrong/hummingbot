const pkg = require("../package.json");
const v = pkg.dependencies?.["@dkivn/contracts"];
if (!/^\d+\.\d+\.\d+$/.test(v || "")) {
  throw new Error("@dkivn/contracts must be pinned to an exact semver");
}
console.log("contracts pin ok:", v);
