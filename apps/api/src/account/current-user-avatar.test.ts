import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { activeWorkspaceContextSchema } from "@newfork/shared";
import { registerEmployeeDirectoryRoutes } from "../employees/employee-directory-routes";
import { createEmployeeDirectoryServiceWithClient } from "../employees/employee-directory-service";

describe("current user avatar", () => {
  it("signs the service-validated private workspace photo for five minutes", async () => {
    const rpc = vi.fn(async () => ({data:"workspace/employee/photo.png",error:null}));
    const createSignedUrl = vi.fn(async () => ({data:{signedUrl:"https://example.test/signed"},error:null}));
    const service = createEmployeeDirectoryServiceWithClient({rpc,storage:{from:() => ({createSignedUrl,remove:vi.fn()})}});
    expect(await service.getOwnAvatar!({actorUserId:"self",workspaceId:"workspace"})).toEqual({present:true,url:"https://example.test/signed"});
    expect(rpc).toHaveBeenCalledWith("get_own_employee_avatar_path_service",{actor_user_id:"self",target_workspace_id:"workspace"});
    expect(createSignedUrl).toHaveBeenCalledWith("workspace/employee/photo.png",300);
  });
  it("uses authenticated identity without directory read permission and rejects cross-workspace access", async () => {
    const userId = "75000000-0000-4000-8000-000000000001";
    const workspaceId = "75000000-0000-4000-8000-000000000102";
    const context = activeWorkspaceContextSchema.parse({ userId,
      workspace: {id:workspaceId,name:"Self avatar"}, permissions:[],
      membership:{id:"75000000-0000-4000-8000-000000000201",userId,workspaceId,role:"employee",status:"active"},
    });
    const rpc = vi.fn(async () => ({data:null,error:null}));
    const app = Fastify();
    registerEmployeeDirectoryRoutes(app,{service:createEmployeeDirectoryServiceWithClient({rpc}),
      contextResolver:{resolve:async () => ({...context,permissions:[]})}});
    const result = await app.inject({method:"GET",url:`/v1/workspaces/${context.workspace.id}/me/avatar?actor_user_id=someone-else`,headers:{authorization:"Bearer token"}});
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({present:false,url:null});
    expect(rpc).toHaveBeenCalledWith("get_own_employee_avatar_path_service",{actor_user_id:context.userId,target_workspace_id:context.workspace.id});
    const denied = await app.inject({method:"GET",url:"/v1/workspaces/75000000-0000-4000-8000-000000000101/me/avatar",headers:{authorization:"Bearer token"}});
    expect(denied.statusCode).toBe(404);
    const anonymous = await app.inject({method:"GET",url:`/v1/workspaces/${context.workspace.id}/me/avatar`});
    expect(anonymous.statusCode).toBe(404);
    expect(rpc).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
