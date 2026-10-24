import { callbackData } from "./callbacks.js";

export type BotButton =
  | { kind: "callback"; text: string; data: string }
  | { kind: "web_app"; text: string; url: string }
  | { kind: "switch"; text: string; query: string };

export type BotKeyboard = BotButton[][];

function tap(text: string, action: string, id = "", arg = ""): BotButton {
  return { kind: "callback", text, data: callbackData(action, id, arg) };
}

export function startKeyboard(): BotKeyboard {
  return [[tap("Create a project", "go", "create")], [tap("I have a join code", "go", "code")], [tap("How Certa works", "go", "how")]];
}

export function howKeyboard(): BotKeyboard {
  return [[tap("Create a project", "go", "create")], [tap("Back", "go", "back")]];
}

export function createdKeyboard(): BotKeyboard {
  return [[tap("Upload contract or BoQ", "go", "upload")], [tap("Invite people", "go", "invite")]];
}

export function skipLocationKeyboard(): BotKeyboard {
  return [[tap("Skip for now", "go", "skip")]];
}

export function roleSideKeyboard(): BotKeyboard {
  return [[tap("Client", "sd", "client")], [tap("Contractor", "sd", "contractor")]];
}

function withRetry(rows: BotKeyboard, retry: boolean): BotKeyboard {
  if (!retry) return rows;
  return [...rows, [tap("Retry", "rx")]];
}

export function roleMenu(role: string, waiting: number, appUrl: string, projectId: string, retry = false): BotKeyboard {
  const base = appUrl.replace(/\/$/, "");
  if (role === "contractor") {
    return withRetry([
      [tap("Submit stage photos", "go", "photos")],
      [tap("My stages", "go", "stages")],
      [tap("Payments", "go", "wallet")],
      [tap("Propose change", "go", "change")],
      [tap("New project", "go", "create")],
      [tap("Switch project", "go", "switch")],
    ], retry);
  }
  if (role === "subcontractor") {
    return withRetry([
      [tap("Submit stage photos", "go", "photos")],
      [tap("My stages", "go", "stages")],
      [tap("Payments", "go", "wallet")],
      [tap("New project", "go", "create")],
    ], retry);
  }
  if (role === "consultant") {
    return withRetry([
      [tap(`Waiting for me (${waiting})`, "go", "review")],
      [tap("Project report", "go", "report")],
      [tap("Disputes", "go", "disputes")],
      [tap("New project", "go", "create")],
      [tap("Switch project", "go", "switch")],
    ], retry);
  }
  return withRetry([
    [tap("Upload contract or BoQ", "go", "upload")],
    [{ kind: "web_app", text: "Review figures", url: `${base}/mini/contract?project=${projectId}` }],
    [tap("Fund", "go", "fund")],
    [tap(`Waiting for me (${waiting})`, "go", "review")],
    [tap("Invite people", "go", "invite")],
    [tap("Project report", "go", "report")],
    [tap("New project", "go", "create")],
    [tap("Switch project", "go", "switch")],
  ], retry);
}

export function inviteRoleKeyboard(): BotKeyboard {
  return [[tap("Contractor", "ir", "contractor")], [tap("Subcontractor", "ir", "subcontractor")], [tap("Consultant", "ir", "consultant")]];
}

export function inviteShareKeyboard(link: string): BotKeyboard {
  return [[{ kind: "switch", text: "Share", query: link }], [tap("Done", "go", "menu")]];
}

export function joinKeyboard(code: string): BotKeyboard {
  return [[tap("Join", "jn", code)], [tap("Not now", "jn", code, "later")]];
}

export function joinedPayKeyboard(): BotKeyboard {
  return [[tap("My stages", "go", "stages")], [tap("How payments work", "go", "howpay")]];
}

export function uploadDoneKeyboard(): BotKeyboard {
  return [[tap("Done", "go", "done")], [tap("Retry", "rx")]];
}

export function readingKeyboard(): BotKeyboard {
  return [[tap("Retry", "rx")]];
}

export function reviewFiguresKeyboard(appUrl: string, versionId: string): BotKeyboard {
  const base = appUrl.replace(/\/$/, "");
  return [[{ kind: "web_app", text: "Review figures", url: `${base}/mini/contract?v=${versionId}` }]];
}

export function manualStagesKeyboard(appUrl: string, projectId: string): BotKeyboard {
  const base = appUrl.replace(/\/$/, "");
  return [
    [{ kind: "web_app", text: "Enter stages manually", url: `${base}/app/p/${projectId}/contract/review` }],
    [tap("Upload more", "go", "upload")],
  ];
}

export function acceptPlanKeyboard(appUrl: string, versionId: string): BotKeyboard {
  const base = appUrl.replace(/\/$/, "");
  return [
    [{ kind: "web_app", text: "Review plan", url: `${base}/mini/contract?v=${versionId}` }],
    [tap("Accept", "ac", versionId, "yes")],
    [tap("Ask for a change", "ac", versionId, "change")],
  ];
}

export function editPlanKeyboard(appUrl: string, projectId: string): BotKeyboard {
  const base = appUrl.replace(/\/$/, "");
  return [[{ kind: "web_app", text: "Edit plan", url: `${base}/app/p/${projectId}/contract/review` }]];
}

export function fundKeyboard(appUrl: string, projectId: string): BotKeyboard {
  const base = appUrl.replace(/\/$/, "");
  return [[{ kind: "web_app", text: "Open Fund", url: `${base}/mini/fund?project=${projectId}` }]];
}

export function stagePickKeyboard(stages: readonly { id: string; label: string }[]): BotKeyboard {
  return [...stages.map((stage) => [tap(stage.label, "ph", stage.id)]), [tap("Cancel", "go", "cancel")]];
}

export function photoListKeyboard(stages: readonly { id: string; label: string; weather: boolean }[]): BotKeyboard {
  const rows: BotKeyboard = [];
  for (const stage of stages) {
    rows.push([tap(stage.label, "ph", stage.id)]);
    if (stage.weather) rows.push([tap("Planning to pour", "pp", stage.id)]);
  }
  rows.push([tap("Cancel", "go", "cancel")]);
  return rows;
}

export function cameraKeyboard(appUrl: string, stageId: string): BotKeyboard {
  const base = appUrl.replace(/\/$/, "");
  return [[{ kind: "web_app", text: "Open camera", url: `${base}/mini/capture?stage=${stageId}` }]];
}

export function certifyKeyboard(appUrl: string, stageId: string): BotKeyboard {
  const base = appUrl.replace(/\/$/, "");
  return [
    [{ kind: "web_app", text: "View photos", url: `${base}/mini/review?stage=${stageId}` }],
    [tap("Certify", "cf", stageId)],
    [tap("Reject", "rj", stageId)],
  ];
}

export function retryPhotosKeyboard(stageId: string): BotKeyboard {
  return [[tap("Send new photos", "ph", stageId)]];
}

export function morePhotosKeyboard(stageId: string): BotKeyboard {
  return [[tap("Send more photos", "ph", stageId)]];
}

export function reviewNowKeyboard(appUrl: string, stageId: string): BotKeyboard {
  const base = appUrl.replace(/\/$/, "");
  return [[{ kind: "web_app", text: "Review now", url: `${base}/mini/review?stage=${stageId}` }]];
}

export function approveKeyboard(appUrl: string, stageId: string): BotKeyboard {
  const base = appUrl.replace(/\/$/, "");
  return [
    [tap("Approve payment", "ap", stageId)],
    [tap("Decline", "dc", stageId)],
    [{ kind: "web_app", text: "View evidence", url: `${base}/mini/review?stage=${stageId}` }],
  ];
}

export function disputeDecideKeyboard(appUrl: string, disputeId: string): BotKeyboard {
  const base = appUrl.replace(/\/$/, "");
  return [
    [{ kind: "web_app", text: "View evidence", url: `${base}/mini/review?dispute=${disputeId}` }],
    [tap("Pay the stage", "dp", disputeId, "pay")],
    [tap("Don't pay", "dp", disputeId, "hold")],
  ];
}

export function variationStageKeyboard(stages: readonly { id: string; label: string }[]): BotKeyboard {
  return [...stages.map((stage) => [tap(stage.label, "vs", stage.id)]), [tap("New stage", "vs", "new")]];
}

export function variationSendKeyboard(): BotKeyboard {
  return [[tap("Send for agreement", "vg", "send")]];
}

export function variationReplyKeyboard(changeId: string): BotKeyboard {
  return [[tap("View", "vv", changeId)], [tap("Accept", "va", changeId)], [tap("Decline", "vd", changeId)]];
}

export function walletKeyboard(): BotKeyboard {
  return [[tap("Technical details", "wt", "show")]];
}

export function projectSwitchKeyboard(projects: readonly { id: string; name: string }[]): BotKeyboard {
  return projects.map((project) => [tap(project.name.slice(0, 40), "sw", project.id)]);
}

export function cancelKeyboard(): BotKeyboard {
  return [[tap("Cancel", "go", "cancel")]];
}

export type TelegramInlineButton =
  | { text: string; callback_data: string }
  | { text: string; web_app: { url: string } }
  | { text: string; switch_inline_query: string };

export function telegramMarkup(keyboard: BotKeyboard): { inline_keyboard: TelegramInlineButton[][] } {
  return {
    inline_keyboard: keyboard.map((row) =>
      row.map((button) => {
        if (button.kind === "web_app") return { text: button.text, web_app: { url: button.url } };
        if (button.kind === "switch") return { text: button.text, switch_inline_query: button.query };
        return { text: button.text, callback_data: button.data };
      }),
    ),
  };
}
