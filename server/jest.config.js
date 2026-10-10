export default {
  roots: ["<rootDir>/tests"],
  testEnvironment: "node",
  transform: {
    "^.+\.ts$": [
      "babel-jest",
      {
        presets: [
          ["@babel/preset-env", { targets: { node: "current" } }],
          "@babel/preset-typescript",
        ],
      },
    ],
  },
};
