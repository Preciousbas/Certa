import { escapeHtml } from "./html.js";

const e = escapeHtml;

export function bullets(lines: readonly string[]): string {
  return lines.map((line) => `• ${e(line)}`).join("\n");
}

/** B-ST-1 */
export function bSt1(): string {
  return [
    "Welcome to Certa \u{1F477}\u{1F3FE}",
    "Certa holds building money safely and pays each stage only when the work is done and checked.",
    "",
    "What would you like to do?",
  ].join("\n");
}

/** B-ST-2 */
export function bSt2(): string {
  return [
    "1. The client uploads the contract or BoQ. Certa reads the figures and both sides agree the payment stages.",
    "2. The client locks the money in an escrow.",
    "3. The contractor sends site photos from Certa. Certa's AI checks the work, the consultant certifies, and the client approves payment.",
    "Every step is recorded.",
  ].join("\n");
}

/** B-ST-3 */
export function bSt3(input: { firstName: string; project: string; roleLabel: string }): string {
  return `Welcome back, ${e(input.firstName)}. Current project: **${e(input.project)}** (${e(input.roleLabel)}).`;
}

/** B-ST-4 */
export function bSt4(): string {
  return "Send me your 8-letter join code (for example K7MX2QPA).";
}

/** B-ST-5 */
export function bSt5(): string {
  return "That code isn't valid or has expired. Ask the person who invited you for a new one.";
}

/** B-ST-6 Stages list. Not in the prompt table; the My stages button needs a line. */
export function bSt6(input: { project: string; lines: string }): string {
  return `Stages on ${e(input.project)}:\n${input.lines}`;
}

/** B-ST-7 */
export function bSt7(): string {
  return "Which project do you want to use?";
}

/** B-PR-1 */
export function bPr1(): string {
  return 'What\'s the project called? (for example "4-bedroom duplex, Plot 14 Lekki")';
}

/** B-PR-2 */
export function bPr2(): string {
  return "Where is the site? Type the address.";
}

/** B-PR-3 */
export function bPr3(): string {
  return "Now share the site's location so Certa can check photos are taken there. Tap \u{1F4CE} \u2192 Location \u2192 Send my current location (or pick the site on the map).";
}

/** B-PR-4 */
export function bPr4(): string {
  return "When does work start? (for example 3 Nov 2026)";
}

/** B-PR-4 invalid date, specified beside B-PR-4. */
export function bPr4Invalid(): string {
  return "I didn't understand that date. Try like this: 3 Nov 2026.";
}

export function bPrRole(): string {
  return "Are you the Client or the Contractor?";
}

/** B-PR-5 */
export function bPr5(input: { project: string }): string {
  return `\u2705 Project created: **${e(input.project)}**.\nNext: upload the signed contract and the priced BoQ.`;
}

/** B-IN-1 */
export function bIn1(): string {
  return "Who are you inviting?";
}

/** B-IN-2 */
export function bIn2(input: { roleLabel: string; date: string; link: string }): string {
  return `Share this link with your ${e(input.roleLabel)}. It works once and expires on ${e(input.date)}.\n${e(input.link)}`;
}

/** B-IN-3 */
export function bIn3(input: { inviter: string; project: string; roleLabel: string }): string {
  return `${e(input.inviter)} invited you to join **${e(input.project)}** as ${e(input.roleLabel)}. Join?`;
}

/** B-IN-4 */
export function bIn4(input: { project: string }): string {
  return `You're in. Payments for your work on ${e(input.project)} will go to your Certa payment account. You don't need to set anything up.`;
}

/** B-IN-5 */
export function bIn5(input: { project: string }): string {
  return `You're in as consultant on ${e(input.project)}. You'll be asked to certify each stage and to decide disputes if the parties can't agree.`;
}

/** B-IN-6 */
export function bIn6(input: { name: string; project: string; roleLabel: string }): string {
  return `${e(input.name)} joined ${e(input.project)} as ${e(input.roleLabel)}.`;
}

/** B-IN-7 How payments work. */
export function bIn7(): string {
  return "Payments are released for each stage only after the photos are checked, the consultant certifies, and the client approves. The money stays locked until then.";
}

/** B-IN-8 Existing taken-side sentence. */
export function bIn8(): string {
  return "That side of the contract is already taken.";
}

/** B-IN-9 Existing revoked-invite sentence. */
export function bIn9(): string {
  return "That invite was revoked.";
}

/** B-IN-10 Existing wallet failure sentence. */
export function bIn10(): string {
  return "The payment account could not be created.";
}

/** B-IN-11 */
export function bIn11(input: { project: string }): string {
  return `You have not joined ${e(input.project)}.`;
}

/** B-UP-1 */
export function bUp1(input: { fileName: string; pagesOrSheets: string }): string {
  return `Got it: ${e(input.fileName)} (${e(input.pagesOrSheets)}). Send more files, or tap Done when you've sent everything.`;
}

/** B-UP-2 */
export function bUp2(): string {
  return "Reading your documents now. This usually takes 1\u20133 minutes for a contract and BoQ. I'll message you when the figures are ready.";
}

/** B-UP-3 */
export function bUp3(input: { ext: string }): string {
  return `I can't read this type of file (${e(input.ext)}). Please send a PDF, Word, Excel or CSV file, or a clear photo of each page.`;
}

/** B-UP-4 */
export function bUp4(): string {
  return "This file is password-protected, so I can't open it. Please remove the password and send it again.";
}

/** B-UP-5 */
export function bUp5(input: { fileName: string }): string {
  return `I couldn't read ${e(input.fileName)}. If it's a scan or photo, please take it again in good light, flat, with the whole page in view.`;
}

/** B-UP-6 */
export function bUp6(input: { appUrl: string; projectId: string }): string {
  const base = input.appUrl.replace(/\/$/, "");
  return `This file is bigger than 20 MB, which is Telegram's limit for bots. Please upload it on the web at ${e(base)}/app/p/${e(input.projectId)}/documents, or send it in smaller parts.`;
}

/** B-UP-7 */
export function bUp7(input: { fileName: string; date: string }): string {
  return `You've already sent this file (${e(input.fileName)}, ${e(input.date)}).`;
}

/** B-UP-8 Prompt after the upload button. Keeps the sentence the bot already sent. */
export function bUp8(): string {
  return "Send the contract or BoQ. Tap Done when you've sent everything.";
}

/** B-EX-1 */
export function bEx1(input: {
  project: string;
  sum: string;
  vatPct: string;
  stages: number;
  retentionPct: string;
  months: number;
  warnings: number;
}): string {
  return [
    `Figures ready for ${e(input.project)}:`,
    `Contract sum: ${e(input.sum)} (VAT ${e(input.vatPct)}% included)`,
    `Stages: ${input.stages} \u00b7 Retention: ${e(input.retentionPct)}% \u00b7 Defects period: ${input.months} months`,
    `${input.warnings} things to check.`,
    "Tap **Review figures** to check each one against your documents.",
  ].join("\n");
}

/** B-EX-2 */
export function bEx2(input: { count: number; firstIssue: string }): string {
  return `I've read your documents, but ${input.count} figures don't add up. For example: ${e(input.firstIssue)}\nTap **Review figures** to fix them before sending the plan to your contractor.`;
}

/** B-EX-3 */
export function bEx3(): string {
  return "I couldn't find a contract sum or any priced items in these documents. Please send the priced BoQ or the page of the contract that shows the contract sum. You can also enter the stages yourself: tap **Enter stages manually**.";
}

/** B-EX-4 */
export function bEx4(): string {
  return "Reading the documents is taking longer than usual. I'll keep trying and message you within 30 minutes. Nothing has been lost.";
}

/** B-AC-1 */
export function bAc1(input: {
  clientName: string;
  project: string;
  sum: string;
  stageLines: string;
  retentionPct: string;
  months: number;
}): string {
  return [
    `${e(input.clientName)} has shared the payment plan for **${e(input.project)}**.`,
    `Contract sum: ${e(input.sum)}`,
    input.stageLines,
    `Retention: ${e(input.retentionPct)}% until ${input.months} months after completion.`,
    "Please check it carefully. Tap **Review plan** to see each figure and where it came from.",
  ].join("\n");
}

/** B-AC-2 */
export function bAc2(input: { contractorName: string; reason: string }): string {
  return `${e(input.contractorName)} asked for a change to the payment plan: "${e(input.reason)}". Tap **Edit plan** to update it.`;
}

/** B-AC-3 */
export function bAc3(input: { dateTimeWat: string; clientName: string }): string {
  return `\u2705 Payment plan agreed by both sides on ${e(input.dateTimeWat)}. Next step: ${e(input.clientName)} locks the money for the first stages.`;
}

/** B-AC-4 */
export function bAc4(input: { project: string; hoursLeft: number }): string {
  return `Reminder: the payment plan for ${e(input.project)} is waiting for your answer. ${input.hoursLeft} hours left before it goes to the consultant.`;
}

/** B-FU-1 */
export function bFu1(input: { project: string }): string {
  return `Lock money for ${e(input.project)}. Choose how much to lock now.`;
}

/** B-FU-2 */
export function bFu2(input: { amount: string; from: number; to: number; explorerLink: string }): string {
  return `\u{1F512} Locked ${e(input.amount)} for stages ${input.from}\u2013${input.to}. It can only be paid out for approved stages.\nProof of payment: ${e(input.explorerLink)}`;
}

/** B-FU-3 */
export function bFu3(input: { client: string; amount: string; from: number; to: number }): string {
  return `Good news: ${e(input.client)} has locked ${e(input.amount)} for stages ${input.from}\u2013${input.to}. You can start stage ${input.from}.`;
}

/** B-FU-4 */
export function bFu4(input: { plainReason: string; supportEmail: string }): string {
  return `The money wasn't locked: ${e(input.plainReason)}. Nothing was taken from your account. Try again, or contact support at ${e(input.supportEmail)}.`;
}

/** B-PH-1 */
export function bPh1(): string {
  return "Which stage are you sending photos for?";
}

/** B-PH-2 */
export function bPh2(input: { stage: string; criteriaBullets: string }): string {
  return `Open the camera to take 3\u20138 photos of **${e(input.stage)}**. Show:\n${input.criteriaBullets}`;
}

/** B-VF-1 */
export function bVf1(input: { n: number; stage: string; project: string; confidence: number; reasonsBullets: string }): string {
  return `\u{1F4CB} Stage ${input.n} \u2014 ${e(input.stage)} on ${e(input.project)} passed Certa's check (${input.confidence}% sure).\n${input.reasonsBullets}\nPlease certify or reject.`;
}

/** B-VF-2 */
export function bVf2(input: { n: number; stage: string; consultant: string; amount: string }): string {
  return `Stage ${input.n} \u2014 ${e(input.stage)} passed Certa's photo check. Waiting for ${e(input.consultant)} to certify. You'll be asked to approve payment of ${e(input.amount)} next.`;
}

/** B-VF-3 */
export function bVf3(input: { n: number }): string {
  return `\u2705 Your photos for stage ${input.n} passed the check. The consultant will now certify it.`;
}

/** B-VF-4 */
export function bVf4(input: { n: number; issuesBullets: string }): string {
  return `\u274C Stage ${input.n} isn't ready for payment yet. The money stays locked.\nWhat's missing:\n${input.issuesBullets}\nWhen it's done, send new photos.`;
}

/** B-VF-5 */
export function bVf5(input: { n: number; missingShotsBullets: string }): string {
  return `I couldn't confirm stage ${input.n} from these photos. Please send more photos showing:\n${input.missingShotsBullets}`;
}

/** B-VF-6 */
export function bVf6(input: { n: number; stage: string; confidence: number }): string {
  return `Stage ${input.n} \u2014 ${e(input.stage)}: Certa isn't sure (${input.confidence}%). The contractor has been asked for more photos. You can also review it yourself.`;
}

/** B-VF-7 */
export function bVf7(input: { n: number; project: string; flags: string }): string {
  return `\u26A0\uFE0F Safety concern seen in photos for stage ${input.n} on ${e(input.project)}: ${e(input.flags)}. Please follow up on site.`;
}

/** B-RV-1 */
export function bRv1(input: { n: number }): string {
  return `Why are you rejecting stage ${input.n}? Your reason will be sent to the contractor (at least 10 characters).`;
}

/** B-RV-2 */
export function bRv2(input: { n: number; consultant: string; reason: string }): string {
  return `Stage ${input.n} was not certified by ${e(input.consultant)}: "${e(input.reason)}". The money stays locked. Fix it and send new photos.`;
}

/** B-AP-1 */
export function bAp1(input: { n: number; stage: string; consultant: string; amount: string; retention: string; contractor: string }): string {
  return `Stage ${input.n} \u2014 ${e(input.stage)} is certified by ${e(input.consultant)}.\nPay ${e(input.amount)} to ${e(input.contractor)}? (${e(input.retention)} retention is kept until the defects period ends.)`;
}

/** B-AP-2 */
export function bAp2(input: { n: number; stage: string; consultant: string; amount: string; cap: string; contractor: string }): string {
  return `Stage ${input.n} \u2014 ${e(input.stage)} is certified by ${e(input.consultant)}.\nThis payment of ${e(input.amount)} is above your spending cap of ${e(input.cap)}, so it needs your approval.\nPay ${e(input.contractor)}?`;
}

/** B-AP-3 */
export function bAp3(input: { amount: string; n: number }): string {
  return `Paying ${e(input.amount)} for stage ${input.n}\u2026 This usually takes under a minute.`;
}

/** B-AP-4 */
export function bAp4(input: { amount: string; contractor: string; n: number; stage: string; explorerLink: string }): string {
  return `\u{1F4B8} Paid ${e(input.amount)} to ${e(input.contractor)} for stage ${input.n} \u2014 ${e(input.stage)}.\nProof of payment: ${e(input.explorerLink)}`;
}

/** B-AP-5 */
export function bAp5(input: { n: number }): string {
  return `Why are you declining payment for stage ${input.n}? This goes to the contractor and the consultant (at least 10 characters).`;
}

/** B-AP-6 */
export function bAp6(input: { n: number }): string {
  return `The payment for stage ${input.n} didn't go through yet. The money is safe in the escrow. Certa is retrying and will message you.`;
}

/** B-AP-7 */
export function bAp7(input: { n: number }): string {
  return `Stage ${input.n} has been certified for 2 days and is waiting for your approval.`;
}

/** B-AP-8 Notice after a decline. The prompt defines the prompt, not this notice. */
export function bAp8(input: { n: number; client: string; reason: string }): string {
  return `Payment for stage ${input.n} was declined by ${e(input.client)}: "${e(input.reason)}". The money stays locked.`;
}

/** B-DI-1 */
export function bDi1(input: { n: number }): string {
  return `Why are you disputing stage ${input.n}? The money will stay locked until it's settled.`;
}

/** B-DI-1 opened, the second sentence in the dispute flow. */
export function bDi1Opened(input: { otherParty: string; consultant: string; decideAfterDate: string }): string {
  return `Dispute opened. ${e(input.otherParty)} and ${e(input.consultant)} have been told. If you can't agree by ${e(input.decideAfterDate)}, ${e(input.consultant)} will decide.`;
}

/** B-DI-1 photos step. */
export function bDi1Photos(): string {
  return "Send photos of the problem, or tap Done.";
}

/** B-DI-2 */
export function bDi2(input: { n: number; reason: string }): string {
  return `The dispute on stage ${input.n} is now yours to decide. Reason: "${e(input.reason)}".`;
}

/** B-DI-4 No open disputes. */
export function bDi4(input: { project: string }): string {
  return `No disputes are open on ${e(input.project)}.`;
}

/** B-VA-1 */
export function bVa1(): string {
  return 'Describe the change (for example "Add a second soakaway").';
}

/** B-VA-1 amount step. */
export function bVa1Amount(): string {
  return "How much will it cost in naira?";
}

/** B-VA-1 stage step. */
export function bVa1Stage(): string {
  return "Which stage does it affect?";
}

/** B-VA-1 summary. */
export function bVa1Summary(input: { title: string; amount: string; stage: string }): string {
  return `${e(input.title)} \u2014 ${e(input.amount)}. It affects ${e(input.stage)}.\nSend this for agreement?`;
}

/** B-VA-2 */
export function bVa2(input: { name: string; project: string; title: string; amount: string }): string {
  return `${e(input.name)} proposed a change on ${e(input.project)}: **${e(input.title)}** \u2014 ${e(input.amount)}. Please accept or decline within 72 hours.`;
}

/** B-VA-3 */
export function bVa3(input: { title: string; amount: string }): string {
  return `Change agreed: ${e(input.title)} (${e(input.amount)}). The payment plan has been updated.`;
}

/** B-VA-4 Amount the bot could not read. */
export function bVa4(): string {
  return "Type the cost in naira, for example 250000.";
}

/** B-WX-1 */
export function bWx1(input: { project: string; stage: string; pct: number; usdc: string }): string {
  return `\u{1F324}\uFE0F Weather check for ${e(input.project)} before the ${e(input.stage)} pour: rain chance in the next 24 hours is ${input.pct}%. Good to pour. (Certa paid ${e(input.usdc)} USDC for this check from your plan.)`;
}

/** B-WX-2 */
export function bWx2(input: { project: string; pct: number; mm: string; usdc: string }): string {
  return `\u{1F327}\uFE0F Weather check for ${e(input.project)}: rain chance in the next 24 hours is ${input.pct}% (about ${e(input.mm)} mm). Pouring concrete now risks weak concrete. Consider waiting or covering the work. (Certa paid ${e(input.usdc)} USDC for this check.)`;
}

/** B-WX-3 */
export function bWx3(input: { project: string; plainReason: string }): string {
  return `Certa couldn't get a weather forecast for ${e(input.project)} right now (${e(input.plainReason)}). Please check the forecast yourself before pouring.`;
}

/** B-WA-1 */
export function bWa1(input: { project: string; lines: string; total: string; retention: string }): string {
  return [
    `Your payments on ${e(input.project)}:`,
    input.lines,
    `Total received: ${e(input.total)}. Retention held: ${e(input.retention)}.`,
    "",
    "Cash out to bank: coming soon. We're adding naira bank withdrawals with a licensed partner.",
  ].join("\n");
}

export function paymentLine(input: { n: number; amount: string; date: string }): string {
  return `Stage ${input.n}: ${input.amount} on ${input.date}`;
}

/** B-WA-2 Shown only after Technical details. */
export function bWa2(input: { address: string }): string {
  return `Payment account: ${e(input.address)}`;
}

/** B-GE-1 */
export function bGe1(input: { requiredRole: string; project: string }): string {
  return `Only the ${e(input.requiredRole)} can do this on ${e(input.project)}.`;
}

/** B-GE-2 */
export function bGe2(input: { requestId: string }): string {
  return `Something went wrong on our side (ref ${e(input.requestId)}). Nothing was paid or changed. Please try again in a minute.`;
}

/** B-GE-3 */
export function bGe3(input: { supportEmail?: string | null }): string {
  const lines = [
    "Here's what I can do:",
    "/menu \u2014 your options for this project",
    "/projects \u2014 switch project",
    "/photos \u2014 send stage photos",
    "/review \u2014 things waiting for you",
    "/wallet \u2014 your payments",
  ];
  const email = input.supportEmail?.trim();
  if (email && email !== "support@example.com") lines.push(`Need a person? Email ${e(email)}.`);
  return lines.join("\n");
}

export function bUnknown(): string {
  return "I don't know that command. Send /menu or /help.";
}

/** B-GE-4 Unknown or expired callback. */
export function bGe4(): string {
  return "This button has expired. Tap /menu to start again.";
}

/** B-GE-5 Slow callback acknowledgement. */
export function bGe5(): string {
  return "Working on it\u2026";
}

/** B-GE-7 Existing rate-limit sentence. */
export function bGe7(): string {
  return "Too many tries. Wait a few minutes.";
}

/** B-GE-9 */
export function bGe9(): string {
  return "Cancelled. Tap /menu to start again.";
}

/** B-RV-3 Nothing in the review queue. */
export function bRv3(input: { project: string }): string {
  return `Nothing is waiting for you on ${e(input.project)}.`;
}

/** A document job is still queued or running, so the review queue is not empty. */
export function bRv4(input: { project: string }): string {
  return `I'm still reading the documents on ${e(input.project)}.`;
}

/** B-CF-1 After the consultant certifies. */
export function bCf1(input: { n: number }): string {
  return `Stage ${input.n} is certified. The client has been asked to approve payment.`;
}

/** B-DI-5 Consultant decides not to pay. */
export function bDi5(input: { n: number }): string {
  return `Stage ${input.n} will not be paid. The money stays locked.`;
}

/** B-VA-5 */
export function bVa5(input: { title: string }): string {
  return `Change declined: ${e(input.title)}.`;
}

/** B-AC-5 Existing minimum-length sentence from acceptPlan. */
export function bAc5(): string {
  return "Say what should change, in at least 10 characters.";
}

/** B-AC-6 One side has accepted. */
export function bAc6(): string {
  return "You accepted. The other side still has to accept.";
}
