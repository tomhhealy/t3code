import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

const DEFAULT_GIT_NAMING_JSON = JSON.stringify({
  worktreeBranchPrefix: null,
  featureBranchPrefix: null,
  worktreeRootName: null,
});

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN git_naming_json TEXT NOT NULL DEFAULT ${DEFAULT_GIT_NAMING_JSON}
  `;

  yield* sql`
    UPDATE projection_projects
    SET git_naming_json = ${DEFAULT_GIT_NAMING_JSON}
    WHERE git_naming_json IS NULL
  `;
});
