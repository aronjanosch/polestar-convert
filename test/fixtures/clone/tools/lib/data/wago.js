// Stand-in for the clone's wago.js: no tables, so loadNames goes through its require path only.
module.exports = {
	pickBuild: async () => ({ build: "1.60.1.1", warnings: [] }),
	cachedTable: async () => { throw new Error("no network"); },
};
