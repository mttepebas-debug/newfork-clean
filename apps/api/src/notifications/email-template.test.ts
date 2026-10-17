import { describe, expect, it } from "vitest";
import { renderNotificationEmail, type NotificationEmailItem } from "./email-template";

// BILDIRIM-14 (KARARLAR S-130): one layout for every notice email, with a plain-text part, the
// workspace's name, the notice and a button into the app; no tracking.
const item: NotificationEmailItem = {
  delivery_id: "98020000-0000-4000-8000-000000000001",
  to: "ali@example.test",
  subject: "Your time off Oct 20–22 is approved",
  title: "Your time off Oct 20–22 is approved",
  body: "Enjoy the break.",
  url: "/app/employee-hub/my-availability?section=time-off",
  workspace_name: "Meyhouse",
  level: "important",
  topic: "Time off",
  idempotency_key: "notification-delivery/98020000-0000-4000-8000-000000000001",
};

describe("renderNotificationEmail", () => {
  it("says the notice, its workspace and links into the app", () => {
    const email = renderNotificationEmail(item, "https://app.example.test/");
    expect(email.subject).toBe("Your time off Oct 20–22 is approved");
    expect(email.html).toContain("Meyhouse");
    expect(email.html).toContain("Enjoy the break.");
    expect(email.html).toContain('href="https://app.example.test/app/employee-hub/my-availability?section=time-off"');
    expect(email.html).toContain("Open in Newfork");
    expect(email.text).toContain("Your time off Oct 20–22 is approved");
    expect(email.text).toContain("https://app.example.test/app/employee-hub/my-availability?section=time-off");
  });

  it("tells why it came and where to change it, unless it is always sent", () => {
    const chosen = renderNotificationEmail(item, "https://app.example.test");
    expect(chosen.text).toContain("You get this because Time off email is on");
    expect(chosen.text).toContain("Account → Notifications");
    const required = renderNotificationEmail({ ...item, level: "required", topic: "Workspace" }, "https://app.example.test");
    expect(required.text).toContain("This message is always sent.");
    expect(required.text).not.toContain("You get this because");
  });

  it("names the account, not a workspace, for an account notice", () => {
    const email = renderNotificationEmail({ ...item, workspace_name: null, level: "required" }, "https://app.example.test");
    expect(email.html).toContain("Your Newfork account");
  });

  it("escapes everything it is given", () => {
    const email = renderNotificationEmail(
      { ...item, title: '<script>alert("x")</script> & co', body: "<b>bold</b>", workspace_name: "Tom's <Bar>" },
      "https://app.example.test",
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>bold</b>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Tom&#39;s &lt;Bar&gt;");
  });

  it("goes to the app's home when the notice has no link, and carries no tracking", () => {
    const email = renderNotificationEmail({ ...item, url: null, body: null }, "https://app.example.test");
    expect(email.html).toContain('href="https://app.example.test/app"');
    expect(email.html).not.toMatch(/<img/i);
  });
});
