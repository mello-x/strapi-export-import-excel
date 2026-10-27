import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLUGIN_ID } from "../constants";
import controllers from "../controllers";
import { makeStrapi } from "../testing/fakes";
import routes from "./index";

const { strapi } = makeStrapi({ services: { [`${PLUGIN_ID}.export-service`]: {} } });

describe("plugin routes", () => {
  const [name, ...rest] = Object.keys(routes);
  const router = (routes as any)[name]();

  it("are only served on the admin API, never on the public content API", () => {
    assert.deepEqual([name, ...rest], ["admin"]);
    assert.equal(router.type, "admin");
  });

  it("require an authenticated administrator on every route", () => {
    assert.ok(router.routes.length > 0);
    for (const route of router.routes) {
      assert.notEqual(route.config.auth, false, `${route.method} ${route.path} disables auth`);
      assert.ok(
        route.config.policies.includes("admin::isAuthenticatedAdmin"),
        `${route.method} ${route.path} lacks admin::isAuthenticatedAdmin`
      );
    }
  });

  it("requires the settings permission to change settings", () => {
    const route = router.routes.find((r: any) => r.method === "PUT" && r.path === "/settings");
    const policy = route.config.policies.find((p: any) => p?.name === "admin::hasPermissions");
    assert.deepEqual(policy.config.actions, [`plugin::${PLUGIN_ID}.settings.read`]);
  });

  it("point at handlers that exist", () => {
    for (const route of router.routes) {
      const [controllerName, action] = route.handler.split(".");
      const controller = (controllers as any)[controllerName]({ strapi });
      assert.equal(typeof controller[action], "function", `${route.handler} is missing`);
    }
  });
});
