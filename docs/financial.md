# How the Money Works

A plain-language guide to the finance side of the platform: how hours become pay, how currencies are handled, how money reaches workers, and how each client's income is split and paid out. It describes the business rules only, not how they are built. The last section explains how to test all of it safely in Test Mode.

---

## 1. The big picture

**How things connect**

- **Desktops (RDPs)** are shared machines that host client accounts on platforms such as Outlier. Many accounts can share a few rented RDPs. A desktop may be tagged with a client for organisation, but claiming it does not pick the client for billing.
- **Workers** may be linked to one or many clients on the Clients page (**Workers on account** roster). That roster is for organisation only. Client income follows **session → client**: an admin links each session to the client the work was for (RDPs are shared; claiming a machine does not pick a client).
- **Clients** own those accounts. A client's **account rate** (USD/hour) is what the account earns. **Expected income** = hours on sessions linked to that client × that rate. An admin can pencil the **received** amount if the real payout differs.
- **Workers are paid their own rate** in their local currency (tier / country), not the client's account rate. Admins see worker rate and pay in **local and USD**; workers see **local only**.
- **Payees** (recipients) are who client money is paid to after costs. Global Solutions is a payee too; its share is kept, not paid out.
- **GlobalSolutions (GS)** collects account income, pays workers and costs, and shares what is left of each client's money between that client's recipients.

**Every month follows the same path**

1. **Hours.** Workers log sessions on a desktop. An admin **links each session to a client** (Sessions page or Add session). The **Hours Log** totals hours per worker and desktop for worker pay. Client income uses only sessions with a client link.
2. **Income.** Expected client income comes from linked-session hours × account rate. The **Income** tab also holds GS account and other income, and any pencil-edited received amounts.
3. **Month checks.** Mismatches (a session with no client, a desktop with no client, a session with no desktop, a split that doesn't add up, a payee with no payout details) block approval. A soft warning is shown when a worker has a session on a client but is not on that client's roster — it does not block approval.
4. **Worker pay.** The month is calculated: each worker's Hours Log total × their rate, plus bonus, minus costs.
5. **Approve.** A **Super Admin** signs off. Exchange rates are frozen for workers and for payee payouts.
6. **Pay workers.** Net pay goes to each worker's in-app wallet, then out in the real world.
7. **Pay payees.** Each payee gets one combined statement in their own currency covering all their clients, and is marked paid with a payment reference.

The **Month** tab under Payroll shows these seven steps with counts and links, plus where the month's money went.

---

## 2. Currencies

### Our main currencies: US Dollar and British Pound

- The company reports in **US Dollars (USD)** and **British Pounds (GBP)**. These are the two "main" currencies and can never be removed.
- Each working month has a **reporting currency** (USD or GBP). A new month copies the previous month's choice, and starts as USD if there is none.
- **Client billing is always in USD.** Client rates, revenue, costs and recipients' amounts are recorded in USD; only the final payee payout is converted to the payee's own currency.
- **Income can be entered in any currency.** It is converted to USD at the rate on the day it is entered (or a rate the admin types), and that figure stays frozen.

### Local payout currencies

- Workers are paid in their **own local currency**, such as Kenyan Shillings, Ugandan Shillings or Nigerian Naira.
- Payees are paid in their **payout currency**, set on the payee.
- Admins keep a **currency list** on the Currencies page. Only currencies on that list can be chosen for pay, and every one of them has an exchange rate.

### Where exchange rates come from

- **Automatic rates.** Rates are fetched from a free online exchange-rate service when:
  - an admin clicks **Refresh from API**
  - a new currency is added
  - a pay rate is set up in a new currency
  - payroll, a payee payout or an income entry needs a rate it doesn't have yet
- **Manual rates.** A super admin can type a rate in by hand.
- **Manual always wins.** An automatic refresh never overwrites a rate an admin has typed in.
- **No automatic daily refresh.** Rates stay as they are until someone refreshes them or one of the triggers above happens.

### How a conversion is worked out

All rates are stored as "1 US Dollar = X of that currency". To convert between any two currencies, the system goes through the US Dollar.

> Example: 1 USD = 129 KES and 1 USD = 3,700 UGX.
> So 1,000 KES = 1,000 ÷ 129 = 7.75 USD, which is 7.75 × 3,700 = 28,682 UGX.

When the system picks a rate, it tries these in order:

1. The same currency on both sides, which is always 1.
2. A direct rate between the two currencies, using a manual one first, then the newest.
3. The reverse of a direct rate.
4. A cross rate worked out through the US Dollar.

### Country → currency

Each worker's country sets their default payout currency. Admins can set this per country. Without an admin setting, the built-in defaults apply:

| Country | Currency |
| :--- | :--- |
| Kenya | KES |
| Uganda | UGX |
| Tanzania | TZS |
| Rwanda | RWF |
| Ethiopia | ETB |
| Nigeria | NGN |
| Ghana | GHS |
| South Africa | ZAR |
| Zambia | ZMW |
| Malawi | MWK |
| India | INR |
| United Kingdom | GBP |
| United States | USD |
| Zimbabwe | USD (on purpose) |

Anything else defaults to USD.

---

## 3. Pay rates (tiers)

### What a tier is

A **tier** is a named rate, such as "Standard" or "Senior". It has:

- an amount
- a currency
- a unit: per hour, per day, per week, per month, or per task
- **who it applies to:** workers, clients, or both

**Worker tiers** set what a worker is paid. Admins can assign one by one, assign everyone, or assign by worker type or partner.

**Client tiers** set the hourly rate a client is billed. Assign them from the Tiers page (**Apply → Clients**) or on the client form. A client on a client tier is billed at the tier's hourly rate, converted to USD; this overrides the client's own billing rate. Without a client tier, the client's own **billing rate (USD/hr)** is used.

A tier that is in use can't be switched between workers and clients until it has been removed from them.

### Turning any unit into an hourly rate

Pay and billing are worked out per hour, so other units are converted:

| Unit | Hourly rate |
| :--- | :--- |
| Per day | rate ÷ 8 |
| Per week | rate ÷ 40 |
| Per month | rate ÷ 160 |
| Per task | used as entered |

### The tier's currency is used exactly as entered

- If a worker tier is **500 KES per hour**, the worker earns 500 KES per hour. The rate is never re-priced through another currency.
- A tier in Ugandan Shillings stays in Ugandan Shillings, even for a worker in Kenya.
- The worker's payout currency is the tier's currency. Only a worker with no rate at all falls back to their country's currency.

### Individual rates and rate history

- Admins can give a single worker their own rate. A reason must be recorded, and an individual rate always beats the tier rate.
- Rate changes take effect from the day they are made. The old rate is kept on record, so past months keep the rate that applied to them.
- For any month, the system uses the newest rate that started on or before the month's last day.

### Changing a rate mid-month

Changing or assigning a worker tier immediately updates payslips in months that are still **open** or **calculated**. Any bonus or costs already on those payslips are converted to the new currency. Approved and paid months are not touched.

---

## 4. The working month

### One month at a time

- Each working month runs from the 1st to the last day of the month.
- The system opens the new month automatically, with the previous month's reporting currency.
- One month is always marked as the **current** month.

### Month statuses

| Status | What it means |
| :--- | :--- |
| **Open** | Work is still coming in. Payslips can be edited freely. |
| **Calculated** | Pay has been worked out. It can still be recalculated or edited. |
| **Approved** | A Super Admin has signed off. Exchange rates are frozen and the month's dates are locked. |
| **Paid** | Money has gone out. Nothing on the month can be edited any more. |

**Moving between statuses**

- **Calculate:** allowed while the month is open or calculated. Any admin.
- **Approve:** allowed only after calculating, and only when no month check is open (or a Super Admin has bypassed them, section 7). **Super Admin only.**
- **Reopen:** sends the month back to open, unless it is already paid. It also clears any bypass. **Super Admin only.**
- **Mark paid** (ends the month): allowed only after approval. **Super Admin only.**

Other admins see the month's status and checks but not these buttons.

### Deleting a month

Deleting a month needs a one-time code that is emailed to the company's alert address and expires after 5 minutes.

- **Removed:** the month's payslips and quality scores.
- **Kept:** work sessions and wallet payments. They are only unlinked from the month.

---

## 5. Hours: sessions and the Hours Log

### What a session counts

**Only the times a worker enters from their work screenshots count.**

- Session time is the **finish time minus the start time** the worker types in, rounded down to the whole minute.
- **Time connected to a remote desktop is not counted.** It is tracked for monitoring only. Shifts and schedules don't create hours either.
- If a session is missing its start or finish time, it counts as **zero** until it is fixed. The worker gets a reminder to complete it.

**Which sessions count towards a month**

- The session started inside that month.
- The session is finished.
- The session hasn't been flagged or excluded.
- The session hasn't already been paid in another month.

### Sessions added by an admin

An admin can add a session for a worker by hand (Workers → open the worker → Sessions & Images → **Add session**), for work that wasn't logged: training, catch-up work, a broken desktop. Switch the form to **Bulk** to add several at once (e.g. work done outside the system): type the number of sessions, a description and the hours, and say whether the hours are the total for all of them or per session (per session is multiplied by the number of sessions).

- It records a **title**, a **date**, the **hours**, the **rate**, a required **client**, an optional **account / desktop**, and an optional **note**.
- **Rate:** the worker's tier rate (or a tier picked when they have none), or a rate typed for this session only, in the worker's payout currency. The form shows the rate and the pay it works out to in local and USD for admins.
- **Client:** required. Hours count toward that client's expected income (hours × account rate). Claiming an RDP does not set the client — shared machines need an admin link.
- **Account / desktop:** optional. When set, hours also go on that desktop's Hours Log row for worker pay.
- The session is closed and approved straight away, with its times already filled, so it never asks for screenshots. It counts in the month its date falls in, which must still be open or calculated.
- Everywhere sessions are listed it shows an **Added by admin** badge and the client (and desktop when set), and the add is recorded in the audit log.

### The Hours Log (Payroll → Hours)

The Hours Log is the **one place a month's hours live**. It has one row per worker per desktop:

- **Session figure:** the hours the worker's sessions add up to on that desktop. Sessions with no desktop (partner or third-party work) go to a **"No desktop"** row.
- **Hours:** the figure that counts. It starts as the session figure.
- **Typed by hand:** an admin can change any row, add a row, or import a CSV (Worker, Desktop, Hours, Note). A typed row shows the session figure next to it and has a **Reset** link to go back to it.

**When the log refreshes from sessions:** on Calculate, and whenever the Hours page or the Payroll ledger is opened, while the month is **open** or **calculated**. Typed rows are never overwritten. An approved month keeps its hours and stops following sessions. A paid month can't be edited.

The page can be grouped by worker, by desktop or by client.

### Hours drive both sides of the money

- **Worker pay:** a payslip's hours are the worker's Hours Log total (all their rows).
- **Client billing:** with the client's **session hours** switch on, the client is billed for hours on sessions linked to that client (section 10).

Editing hours anywhere writes to the Hours Log, so the two always agree:

- Typing hours on a payslip or in the Payroll ledger updates the worker's log rows. An increase goes on their busiest desktop (or a "No desktop" row); a decrease comes off the largest rows first.
- Editing the Hours Log updates the payslip's hours straight away.

**After calculating**, each counted session is tied to that month, so it can never be paid twice.

---

## 6. How pay is calculated

### Step 1: Company hours

> **Hours Log total × hourly rate**, in the worker's payout currency.

Hours typed above the session figure are paid at the same rate as session hours.

**Admin-added sessions with their own rate** are paid at that rate instead: the payslip adds hours × (session rate − worker's rate) for each one. A worker on 500 KES/hour with an admin-added 3-hour session at 700 KES/hour is paid 3 × 200 = 600 KES more than hours × 500. This also holds on hand-locked payslips.

### Step 2: Partner and third-party sessions

Some work is done on partner or third-party accounts that earn a recorded amount.

**Who gets what**

- A partner arrangement sets three percentages: **worker**, **company** and **partner**. They must add up to 100%.
- The worker's share is: earnings × worker %.
- The company's share is: earnings × company %.
- The partner gets whatever is left. This makes sure every cent is accounted for.
- With no arrangement on file, the worker keeps 100% and the payslip is flagged for review.

**Currency:** partner earnings are recorded in the month's reporting currency, then converted into the worker's payout currency.

### Step 3: Bonus and costs

- A **bonus** is added on top.
- Two kinds of cost can be taken off:
  - a **transfer cost**, such as mobile-money or bank fees
  - an **external cost**, any other charge
- Admins enter these by hand, or they come from shared costs (section 11). They are never invented by the system, and they survive a recalculation.

### Step 4: The totals

| Line | How it's worked out |
| :--- | :--- |
| Base pay | company pay + partner earnings (converted) |
| Gross pay | base pay + bonus |
| Total deductions | transfer cost + external cost |
| **Net pay** | **gross pay − total deductions** |
| Reporting equivalent | net pay converted back to the month's USD or GBP, for company reports |

### Worked example

Amina is in Kenya on a tier of **500 KES per hour**. The month is reported in **USD**, at 1 USD = 129 KES.

- **Company hours:** 40 hours × 500 = **20,000 KES**
- **Partner session:** USD 50 earned on a 70% worker / 20% company / 10% partner split.
  - Amina's share is USD 35, which at 129 is **4,515 KES**.
  - The company keeps USD 10 and the partner gets USD 5.
- **Bonus:** 1,000 KES
- **Transfer cost:** 150 KES

| Line | Amount |
| :--- | :--- |
| Base pay | 20,000 + 4,515 = 24,515 KES |
| Gross pay | 24,515 + 1,000 = 25,515 KES |
| Net pay | 25,515 − 150 = **25,365 KES** |
| Reporting equivalent | 25,365 ÷ 129 = **USD 196.63** |

### Admin edits and locked payslips

- When an admin edits a payslip by hand (rate, bonus, costs or currency), that payslip becomes **admin-locked**.
- Recalculating keeps the admin's values. Hours still follow the Hours Log, and base pay is redone as hours × the admin's rate.
- Changing a payslip's currency resets its exchange rate, so the new currency gets a fresh one.
- An admin can pay someone whose sessions are incomplete by typing in their hours and rate. The hours go into the Hours Log as typed rows, and everyone else can still be recalculated normally.

### Editing many workers at once

The Finance page lists **every active worker** for the month, including people with no payslip yet, so nobody is left out. Each row shows hours, rate, base pay, bonus, gross pay, deductions, net pay, currency and any warnings.

- **One worker:** open the eye icon to see and edit that person's full payslip, exactly as it will print.
- **A group:** use **Apply to many** to give the same bonus, rate, cost or currency to:
  - all workers
  - company workers only
  - partners only
  - the workers you've ticked

  Only the fields you fill in are changed. Giving every partner a bonus leaves their hours and rates alone.
- **Choosing a new currency** always fetches that currency's rate, replacing any typed one.
- **Row by row:** the **Payroll ledger** button opens every worker's payslip on one sheet for wide edits. Client income is not entered here; it goes on the Client ledger (section 10).
- Saving any edit on an open month moves it to **calculated**.

### Warnings shown on payslips

| Warning | What it means |
| :--- | :--- |
| No rate | The worker has no pay rate. |
| No exchange rate | No rate exists between the worker's currency and the month's currency. |
| Missing earnings | A partner session has no earnings recorded. |
| No partner arrangement | There are partner sessions but no split on file. |
| No hours | Nothing payable was logged. |
| Negative net | Costs are bigger than earnings. |

Workers with no hours are removed from the month, unless they have a bonus or a cost on record.

---

## 7. Month checks and approval

### Month checks

Before a month can be approved, the system looks for mismatches. Each one is listed on the Month overview and the Payroll pages with a **Resolve** link to the page that fixes it.

| Check | What it means | Resolve opens |
| :--- | :--- | :--- |
| Session with no client | A finished session has hours but no client linked, so no client is billed for it | Sessions |
| Desktop with no client | A desktop logged hours this month but isn't linked to a client | Desktops |
| Worker not linked to desktop | A worker has sessions on a desktop they aren't assigned to | Desktops |
| Session with no desktop | A worker's session (not one added by an admin) has no desktop | The worker |
| Client split | A client's recipients don't add up to 100%, or the amounts don't add up to the net | Client split |
| Payee not on the list | A recipient is a name only, not a payee | Client split |
| Payee details missing | A payee being paid has no payout currency or details | Payees |
| Worker not on roster *(warning)* | A worker has a session linked to a client but is not on that client's worker roster | Clients |

**Open checks that block approval** stop Approve. Soft **warnings** (worker not on roster) are listed but do not block. A **Super Admin** can **bypass** blocking checks with a written reason (at least 5 characters). The bypass, who made it, when, and the checks it covered are recorded and shown on the month. A bypass only covers the blocking checks that were open at the time: a new blocking check that opens later blocks approval again. Reopening the month clears the bypass.

### Approval: freezing the exchange rate

When a Super Admin **approves** the month:

- The exchange rate for each payslip is **frozen at that day's rate**. Later rate changes don't alter what was approved.
- Hand-locked payslips keep the rate the admin set.
- The reporting-currency figures are recalculated with the frozen rates.
- Payslip PDFs are rebuilt.
- **Payee payouts are prepared:** each payee's amounts across all their clients become one payout in the payee's currency, at that day's rate (section 10).

---

## 8. Payslips

- A PDF payslip is created for each worker after calculating, after approving and after sending pay. It can also be created on request.
- Each payslip shows hours, rate, base pay, bonus, gross pay, each cost, total deductions and **net pay**. Every line shows the local amount and the reporting-currency equivalent.
- Admins can download one payslip, all of them together, or a spreadsheet of the whole month.
- Workers can see and download their own payslips in their wallet once the month is calculated. Until the month is approved, those payslips carry a **Not final** badge. A worker can only ever open their own payslip.

### Emailing payslips

Payslip emails are sent from the Receipts page and are built to handle the whole workforce at once.

**How sending works**

- **Queued.** Pressing send queues the emails and returns straight away. They go out in the background, and a progress bar shows how far along the send is.
- **Restart-safe.** If the system restarts mid-send, it carries on where it stopped, without losing anyone or emailing anyone twice.
- **No repeats.** Workers already emailed for that month are skipped, so re-sending after fixing a few payslips doesn't spam everyone. An admin can force a re-send if needed.
- **Failures.** Failed emails are retried automatically a few times. Anything still failing can be retried with **Retry failed**. A send can also be cancelled; emails already sent stay sent.

**What the email contains**

- **Default:** a styled email showing the payslip lines, the net pay and a button to the wallet.
- **PDF attached:** possible when it's contractually needed, but it sends much more slowly.
- **In-app notice:** every worker also gets one, so they see their payslip even if the email is delayed or lands in spam.

**Announcements** use the same queue. They can go to workers filtered by country or type, to typed-in addresses only, or both, with extra addresses copied in.

### Email history

The Email History page keeps a permanent record of every email sent, including payee statements. It separates two questions:

- **Accepted:** did the email leave the platform?
- **Delivery:** what happened next? (delivered, opened, clicked, delayed, bounced, or marked as spam)

An email can be accepted and still bounce. A "delivered" email can still sit in the worker's spam folder, because delivered only means the receiving server took it. Delivery updates arrive automatically, and an admin can also refresh them by hand.

---

## 9. Wallets

### One wallet per worker

- Every worker has one wallet, with one balance in one currency.
- A new wallet uses the worker's payout currency.

### Sending pay to wallets

Admins use **Send pay to wallets** on the Wallets page:

1. Choose the month, and optionally which workers.
2. If the month is only calculated, a **Super Admin** can approve it here first, which freezes the rates and rebuilds the payslips. The month checks still apply. Other admins must wait for the month to be approved.
3. Each worker with positive net pay receives a **payroll credit** for exactly their net pay.
4. The worker gets a "Payment received" notification.

**Safeguards**

- A worker can only be credited **once per month**. Pressing the button again never pays twice.
- Workers with zero or negative net pay are skipped.

### What the worker sees

The worker's wallet history shows, for every payment:

- the amount
- which month the work was for, and the work dates
- the hours and rate behind it
- the date and time it was received

### When a worker's currency changes

If a worker's payout currency changes while they still have money in the wallet:

1. Their existing balance is converted to the new currency at the current rate.
2. The wallet history shows two entries: the old balance leaving in the old currency, and the converted balance arriving in the new one, with the rate used.
3. If no rate is available, that worker's payment waits, and the admin is told how many were skipped.

An empty wallet simply switches currency.

### Manual adjustments

- Admins can add money to or take money from a wallet, with a required note explaining why.
- An adjustment entered in another currency is converted into the wallet's currency first.
- Taking money out is recorded as a **payout**.
- Balances are not blocked from going below zero, so admins should check the balance first.

### Paying out in the real world

The platform does not move real money itself. When a worker is actually paid (for example by mobile money, using the name and provider on their profile):

1. The admin records it as a payout on the wallet.
2. A Super Admin marks the month **Paid**.

---

## 10. Income, the client split and payee payouts

In short: each client's **expected income** is **hours × account rate (USD/hr)** and updates as work is logged. **Revenue** is what was **received** (pencil / Income tab) when entered, otherwise that expected figure. Revenue pays for **all its costs** first. What is left, the **net distributable**, is shared between the client's **recipients** by percentage. Global Solutions keeps its own share; every other payee is paid once a month, in their own currency, with one statement covering all their clients.

### What each client holds

Set on the client (Clients page, or the client import):

- **Billing rate (USD/hr)** — the account's earn rate — or a **client tier** that overrides it.
- **Active?** and **Notes**.
- **Workers on account:** one or many workers on the roster (does not set pay rates or billed hours).
- **Desktop hours switch** (**on** by default for new clients):
  - **On:** billed hours come from the Hours Log on its desktops, so expected income tracks sessions automatically.
  - **Off:** the admin types the client's billed hours. A wrong or missing desktop link can't then produce wrong money.
  - Worker pay never depends on the switch.

Who is paid from a client's net is the client's **recipients** (on the ledger) from the **Recipients / Payees** list.

The **Sheet columns** toggle on the Clients page adds the tier, desktop-hours switch and payout currency to the list without changing its default look.

**Client import.** The client import template has columns for Client %, Client Tier, Desktop Hours, Payout Currency, Payout Email, Payout Method and Payout Details.

- Client % can be written as `30`, `30%` or `0.3`. It is only a starting point: a client that has never had recipients starts with its owner on that %, and Global Solutions on the rest.
- Desktop Hours takes yes/no.
- Client Tier must match the name of a tier that applies to clients.
- An unknown tier or currency is reported for that row, and the rest of the file still imports.

### Income (Payroll → Income)

Every amount received in the month is entered here. Together the entries are the month's **total income pool**.

| Category | Use it for | Linked to a client? |
| :--- | :--- | :--- |
| **Client account payout** | What a work platform paid for a client's account | Yes: it becomes that client's revenue |
| **GS account** | Money paid into Global Solutions' own account | No |
| **Other income** | Anything else. A description is required. | No |

- Each entry has an **amount** and **currency** (any currency), an optional **received on** date, and a description.
- It is converted to USD **when it is entered**, at that day's rate. A rate can be typed instead (units per 1 USD). The USD figure stays frozen; it only changes if the amount, currency or rate is edited.
- A client can have several entries in a month; its revenue is their total in USD.
- The page shows the income pool and a total per category, and can be filtered by category.
- Entries can be added, changed and deleted until the month is paid.

### The client ledger (Clients → Client ledger)

One table, one row per client for the month, all in USD. The **Client split** switch in the header changes which columns follow the fixed ones. The choice is remembered on that computer, and a link can force it (`?split=1` or `?split=0`).

**Always shown**

| Column | How it's worked out |
| :--- | :--- |
| Client | The client's name |
| Hours | Billed hours: sessions linked to the client (switch on), or the typed figure (switch off) |
| **Revenue USD** | **Received** when entered; otherwise **expected** (hours × account rate). |

**Income detail (client row details)**

| Figure | How it's worked out |
| :--- | :--- |
| Rate | The client tier's hourly rate in USD, else the client's billing rate |
| **Expected (auto)** | billed hours × rate — updates as sessions / Hours Log change |
| **Received (pencil)** | Optional actual payout; saved as a client account payout on the Income tab |
| Variance | received − expected |
| Payout status | The status of the payee payouts this client is on |

**Split columns (Client split on)**

| Column | How it's worked out |
| :--- | :--- |
| Worker pay | Hours on sessions linked to the client × each worker's pay rate, in USD and in the local currency chosen in the header (at its "per USD" rate) |
| Transfer | Each worker's payslip transfer cost, shared across clients by that worker's linked-session hours on each client. USD and local. |
| Other costs | The client's part of shared costs (section 11) + any one-off cost typed here |
| Total costs | worker pay + transfer + other costs |
| **Net distributable** | revenue − total costs |
| **Recipients** | Who the net distributable is shared between (below) |
| Check | **OK**, or **Check split** |

**Typing received.** The Received pencil edits the client's one **client account payout** entry on the Income tab, in USD: typing creates or changes it, clearing it removes it. Until then, revenue uses expected. A client with several entries this month is edited on the Income tab instead.

**Apply to many.** Tick clients (or use all visible ones) to set one-off costs, rate or the desktop-hours switch for all of them at once. Locked clients are skipped.

### Recipients

A client can have **any number of recipients**. Each recipient is a payee picked from the Payees list (or added from the same dropdown with **+ New payee…**) with a **%**.

- **Amount = net distributable × %**, to the cent.
- **Typed amounts.** An amount can be typed over, for example to round a figure. The worked-out amount stays visible, and **auto** goes back to it.
- **Check.** The row shows **OK** only when the % add up to exactly 100 **and** the amounts add up to exactly the net distributable. Otherwise it shows **Check split**, and the month can't be approved (section 7). Three recipients on 33.3% add up to 99.9%: give one of them 33.4%.
- **Global Solutions** is a recipient like any other. Its amount is **kept**, not paid out. Without it on the list, the other recipients get everything.
- **Saved per client per month.** A month without its own recipients uses the client's most recent earlier month ("recipients from …"). A client that has never had any starts from its imported owner % (owner, any third party, Global Solutions on the rest), or Global Solutions on 100%. Changing them in a month saves them for that month only.
- A new line suggests the % still missing to reach 100.

### Payees (Clients → Payees)

The people or companies client money is paid to. A payee can be a recipient on any number of clients.

- **Name**, **payout currency**, **payout method**, **payout email**, **payout details** and **notes**.
- **Global Solutions** is the one payee marked **GS**. Its share is kept. Only one payee can be GS: marking another one moves the mark.
- A payee owed money needs a payout currency and either an email or payout details. Without them the page warns "missing payout details", and the month check blocks approval.
- **Delete** removes an unused payee. A payee already on a split or a payout is **archived** instead: it keeps its history and leaves the pick lists. The **Archived** tick box lists them again.
- Global Solutions can't be removed; mark another payee as GS first.
- The list shows each payee's clients.

**Warnings on the ledger**

- Desktop hours is on but no desktop is linked, or the linked desktops have no hours.
- Hours but no billing rate.
- Received differs from expected by more than 5%.
- No recipients, % that don't add up to 100, or amounts that don't add up to the net distributable.
- A recipient that isn't on the Payees list, or a payee with no payout details.
- Costs are more than revenue, so the net distributable is negative.

### Worked example: Marcel 1

Marcel 1 is billed at **$18.70/hour**. Its desktops logged **100 hours**, worked at **$8.00/hour**. The workers' transfer costs come to **$10**, and it is charged **$20** of other costs. Its recipients are its owner on **30%**, a referrer on **10%** and Global Solutions on **60%**.

| Line | Amount |
| :--- | :--- |
| Expected | 100 h × $18.70 = **$1,870.00** |
| Received (Income tab) | **$1,800.00** (variance −$70.00, under 5%, so no warning) |
| Revenue | received, so **$1,800.00** |
| Worker pay | 100 h × $8.00 = $800.00 |
| Transfer | $10.00 |
| Other costs | $20.00 |
| Total costs | **$830.00** |
| **Net distributable** | $1,800 − $830 = **$970.00** |
| Owner 30% | **$291.00**, paid out |
| Referrer 10% | **$97.00**, paid out |
| Global Solutions 60% | **$582.00**, kept |

If the owner's payout currency is EUR and the rate frozen on approval is 1 USD = 0.92 EUR, their statement shows **€267.72**.

If the admin types the owner's amount as $300.00, the amounts add up to $979.00, not $970.00: the row shows **Check split** until Global Solutions' amount is lowered to $573.00 (or the owner's goes back to auto).

### Payee payouts (Payroll → Payee payouts)

One row per payee owed money this month, with their total across all clients. **N clients** opens the lines behind it: each client, the payee's %, and the amount.

- **Before approval** the page is a preview at the latest stored rate.
- **Approving the month** prepares **one payout per payee**: the total in USD, the payee's currency, the rate (frozen that day) and the local amount.
- If ledger figures change after approval, the payouts follow them, keeping the frozen rate. **Refresh rates** takes today's rates instead. An admin can also type a rate for one payout.
- **One combined statement per payee per month:** a PDF with a section for each of their clients (revenue and whether it was received or expected, hours, worker pay, transfer cost, other costs, net distributable, the payee's %, and their share, including the worked-out figure when a typed amount replaced it) and the total in USD and in the payee's currency. Download it, or **email** it to the payee's payout email (one payee, the ticked payees, or every unsent one). A statement whose figures change after sending goes back to **To send**.
- **Mark paid** with a payment reference and date. From then on, that payout and the ledger rows of **every client on it** are **locked** for the month; the other payees on those clients keep the amounts already worked out. **Undo** reverses a mistaken "paid" while the month itself is not yet marked paid.
- **Kept by Global Solutions** lists GS's amount per client. Nothing is sent.
- **Paid in the earlier format.** Months paid before payees existed keep their per-client payouts, shown read-only below. Clients paid that way are left out of the payee payouts.

| Payout status | Meaning |
| :--- | :--- |
| Preview | The month is not approved yet. |
| To send | Prepared, statement not sent (or the figures changed since). |
| Sent | Statement emailed. |
| Paid | Payment recorded. Locked. |

The **RDP earnings report** (Reports) still shows session hours × rate per desktop for monitoring. It doesn't drive the split.

---

## 11. Shared costs

Admins can enter a cost once for the month, such as software or internet, and share it out automatically (Payroll → Shared costs):

- **Who pays:** a chosen percentage goes to workers and the rest to clients.
- **Splitting within each group:** equally, or by custom percentages that add up to 100%.
- **Rounding:** cents are shared out so the parts always add up exactly to the total.
- **Workers:** each worker's part is converted to their currency and added to their bonus or costs on the payslip.
- **Clients:** each client's part is **charged to that client**: it shows in the ledger's Other costs column and reduces the client's net distributable, so every recipient bears it by their %.
- **Removing a cost:** reverses it.
- **When it can change:** only while the month is open or calculated.

A one-off cost for a single client is typed straight into that client's Other costs on the client ledger (Client split on).

**Client income this month (Payroll → Month data).** This step shows each client's income in USD and lets it be typed per client. It writes the same client account payout entry as the ledger's Received pencil, so the two always agree.

---

## 12. Showing the whole site in one currency (the currency switch)

Admins and leadership have a **currency switch** in the top bar, next to the notifications bell. It is a single dropdown, and it changes **how money is shown, not what is stored**.

### What it does

- **Default** shows every page and column in its own currency, exactly as it was recorded. This is where everyone starts.
- When a currency is picked, the button shows that currency's code. **Back to default** at the top of the dropdown, or the **Default** option, returns everything to its own currency in one click.
- Picking a currency converts every amount on the finance pages into it, using the current rates from the Currencies page:
  - Finance overview
  - Reports
  - Wallets
  - Calendar
  - Clients
  - Financial Intelligence, Analytics, Utilization and CEO Command
- **USD** and **GBP** are always at the top of the list. Every other active currency on the Currencies page follows.
- Totals that used to be split by currency (for example "KES 1,000 · UGX 50,000") collapse into **one figure** in the chosen currency.
- **The choice is personal.** It only affects the admin who made it, on that computer, and applies to every page they open. Other admins, leadership and workers are not affected.

### What it does not do

- It **does not change any saved amount**. Pay, payslips, wallets and reports keep their real values and currencies.
- It **does not change what workers see**. Workers always see their pay and wallet in their own currency.
- **Forms where money is typed in** (pay rates, bonuses, costs, wallet adjustments) always use the record's own currency, so nothing is entered in the wrong currency by mistake.

### Things to know

- The switch uses **today's rates**. Approved months use the rate frozen on approval day, so a converted figure can differ slightly from the reporting equivalent on a payslip. The payslip figure is the official one.
- If a currency has no rate yet, its amounts stay in their original currency until a rate is added.

### Adding a currency to the switch

1. Open **Finance → Currencies**.
2. Add the currency. The rate is fetched automatically, or you can type one in.
3. It appears in the switch straight away.

---

## 13. Month-end checklist for admins

The **Month** tab under Payroll (the Month overview) tracks the seven steps below. Each step shows whether it is done, a count, and a link to the page that fixes it. The page also shows:

- **The month checks**, each with a **Resolve** link, and any Super Admin bypass with its reason.
- **Approve, Reopen and Mark paid** buttons, for Super Admins only. Approve is disabled while checks are open and not bypassed.
- **Totals for the month, in USD:**
  - **Income pool:** every Income tab entry, with a total per category.
  - **Payee payouts:** what is owed to payees other than Global Solutions, and how much of it is still to pay.
  - **Worker pay:** what payslips pay out, split into pay from desktop work and from admin-added sessions, and how much is still to credit.
  - **Expenses:** transfer costs + shared costs + one-off client costs.
  - **GS keeps** = income pool − payee payouts − worker pay − expenses.
- **A money-flow bar** splitting the income pool into payee payouts, worker pay, expenses and what GS keeps.
- **A table of clients** with each one's hours, revenue, costs, net distributable, recipients, GS's amount and payout status.

**Before the month ends**

- Make sure the month exists on the Calendar or Finance page, in USD or GBP.
- Check tiers: worker tiers and who is on each, client tiers and which clients use them.
- Check each client's rate and desktop-hours switch (the Clients page **Sheet columns** toggle shows them all).
- Check the Payees page: everyone owed money needs a payout currency and payout details.
- Check the Currencies page: every worker and payee payout currency should be listed, with a current rate.
- Rate each worker's quality for the month. This feeds the leaderboard only, not pay.

**Closing the month**

1. **Hours.** Open Payroll → Hours. Fix hours logged with no desktop and desktops with no client. Type corrections where needed (they are kept), import the month's hours sheet, or add sessions for work that wasn't logged.
2. **Income.** On the Income tab, enter every amount received: client account payouts against their client, GS account income, other income with a description. Type billed hours on the Client ledger for clients with the desktop switch off.
3. **Month checks.** Turn on Client split on the Client ledger. Add one-off costs, and check each client's recipients add up (OK on every row). Resolve every open check, or have a Super Admin bypass them with a reason.
4. **Worker pay.** Calculate (and recalculate if anything changes). Review the payslip warnings (no rate, no exchange rate, missing earnings and so on).
5. **Approve.** A Super Admin approves. This freezes worker and payee exchange rates and prepares the payee payouts.
6. **Pay workers.** Send pay to wallets, email the payslips from the Receipts page, pay workers in the real world and record the payouts.
7. **Pay payees.** On Payee payouts, check each amount, email each payee's statement, pay them and **mark it paid** with the reference.

Finally, a Super Admin **marks the month paid**. Nothing on it can change after that.

---

## 14. Safeguards and audit trail

- **No double pay.** A session can only be paid in one month, a worker can only be credited once per month, and a payee payout can only be marked paid once.
- **One source of hours.** Payslip hours and client billed hours both come from the Hours Log, so they can't disagree. Typed hours are never overwritten by sessions.
- **One source of income.** A client's revenue is its Income tab entries. The ledger and Month data edit the same entry.
- **Frozen history.** Approval freezes exchange rates for workers and payees, and income is frozen in USD when entered. A paid payee payout locks the month of every client on it. Paid months can't be edited, and approved months can't have their dates changed or sessions added.
- **Checks before sign-off.** A month with open checks can't be approved unless a Super Admin bypasses them with a reason, which is kept on the month.
- **Super Admin sign-off.** Only a Super Admin can approve, reopen or mark a month paid, bypass checks, or approve a month from the Wallets page.
- **Exact rounding.** Hours are rounded down to the whole minute, and partner and shared-cost splits always add up to the cent. A client's recipients must add up to the net distributable exactly.
- **Protected deletion.** Deleting a working month needs an emailed one-time code.
- **Audit log.** Key money actions are recorded with who did them and when: hours edits and imports, sessions added by an admin, income entries, client ledger and recipient edits, payee changes, statements sent, payee payments and their undo, payout rate changes, check bypasses, and sending pay to wallets.

---

## 15. Not handled by the platform (today)

- Tax calculation and tax withholding
- Worker withdrawal or cash-out requests
- Direct payment-provider integration. Real payouts to workers and clients are made outside the platform and recorded.
- Invoicing the work platforms (Outlier and others), and company expense tracking beyond shared costs
- A scheduled daily exchange-rate refresh

---

## 16. Glossary

| Term | Meaning |
| :--- | :--- |
| **Reporting currency** | The month's main currency (USD or GBP), used for company totals. |
| **Payout currency** | The currency a worker or payee is paid in. |
| **Tier** | A named rate with an amount, currency and unit. Worker tiers set pay; client tiers set a client's billing rate. |
| **Hours Log** | The month's hours per worker per desktop. The source for payslip hours. |
| **Session hours switch** | Per client (field still named `hours_from_desktops`). On (default for new clients): billed hours come from sessions linked to the client. Off: the admin types them. |
| **Workers on account** | Roster of workers linked to a client. Organisation only; income still needs each session linked to the client. |
| **Expected** | A client's billed hours × its rate. |
| **Income pool** | Every Income tab entry for the month, in USD: client account payouts, GS account income and other income. |
| **Received** | A client's income entries for the month, in USD: what the work platform actually paid for the account. |
| **Revenue** | A client's received amount, else its expected amount. |
| **Worker pay (on a client)** | Hours on sessions linked to the client × each worker's pay rate, in USD. |
| **Net distributable** | Revenue − worker pay − transfer cost − other costs. The amount shared between the recipients. |
| **Recipient** | A payee on a client's split for the month, with a %. Gets net distributable × % (or a typed amount). |
| **Payee** | A person or company client money is paid to, with payout currency and details. Global Solutions is the payee marked GS. |
| **GS keeps** | Income pool − payee payouts − worker pay − expenses, for the whole month. |
| **Payee payout** | One payment per payee per month: their amounts across all clients, in their currency. |
| **Payee statement** | The monthly PDF sent to a payee with one section per client and the total, in USD and their currency. |
| **Month checks** | Mismatches that block approval: sessions with no client, desktops with no client, unlinked or desktop-less sessions, splits that don't add up, payees missing or without details. |
| **Bypass** | A Super Admin's approval despite open checks, with a reason kept on the month. |
| **Added by admin** | A session an admin entered by hand with a required client (desktop optional). Approved straight away, optionally with its own rate. |
| **Expected (auto)** | Client billed hours × account USD rate. Updates as sessions and the Hours Log change. |
| **Gross pay** | Base pay plus bonus. |
| **Net pay** | Gross pay minus costs. This is what lands in the wallet. |
| **Reporting equivalent** | Net pay converted to the reporting currency for company reports. |
| **Admin-locked payslip** | A payslip an admin has edited by hand. Recalculating keeps the admin's values. |
| **Partner arrangement** | The worker / company / partner percentage split for partner work. |
| **Display currency** | The currency an admin chose in the top bar to view amounts in. Personal and for viewing only. "Default" means each page and column shows its own currency. |

---

## 17. Testing in Test Mode

A test plan for checking the finance logic end to end without touching real money or real records. It lists checks to run; it is not a record of completed tests. Record the deployed version before testing, because a local build may differ from gsdeck.com.

### 17.1 How the pieces connect

```text
Working month + workers + tiers + currencies + clients + desktops
             |
Closed work sessions with entered screenshot times
             |
Hours Log (worker x desktop), with typed corrections and admin-added sessions
             |                                   |
Calculate payroll -> payslips          Income tab -> client revenue (received, else expected)
             |                         Client ledger: revenue - all costs = net distributable,
Bonuses / transfer costs / external    shared between recipients (payees) by %
costs / shared costs                             |
             |                                   |
Month checks: resolve, or Super Admin bypass with a reason
             |
Super Admin approves: freeze FX for payslips and payee payouts
             |                                   |
Credit wallets -> worker payslip,      Payee payouts: one combined statement per payee,
balance, history, notification         email, mark paid with reference (locks its clients)
             |
External payment recorded as wallet payout -> Super Admin marks month paid
```

The platform records money and allocations. A wallet credit is not a bank or mobile-money transfer, and marking a payee paid does not move money. Monthly member approval (access), session payroll inclusion and payroll-month approval are three different decisions.

Sign in as a **Super Admin** for the approval, reopen, bypass and mark-paid cases, and as a plain admin for the cases that check those actions are hidden or refused.

### 17.2 Pages to exercise

| Screen | Route | What to exercise |
|---|---|---|
| Settings | `/admin/settings` | Private Test Mode, preparation, permitted test email addresses, leave/clear workspace |
| Test Month | `/admin/payroll/test-month` | Create five test workers, select days, generate records, open worker view, reset/delete |
| Workers | `/admin/workers` | Worker type, country, status, tier assignment, individual pay terms, monthly approval (require approval, approve all, approve/unapprove selected), Add session |
| Clients | `/admin/clients` | Rate, client tier, desktop switch, Sheet columns toggle, linked desktops, import |
| Client ledger | `/admin/clients/ledger` | Billed hours, revenue pencil, Client split switch, other costs, recipients, typed amounts, check, apply to many, warnings |
| Payees | `/admin/clients/recipients` | Add/edit payees, GS mark, missing-details warning, delete vs archive |
| Income | `/admin/payroll/income` | Entries per category, currency and typed rate, frozen USD, client link, description for other income |
| Payroll | `/admin/payroll` | Month filter, worker detail, manual edits, Payroll ledger, Apply to many, calculation and warnings |
| Tiers | `/admin/payroll/tiers` | Rate, currency, unit, applies-to, worker and client assignment |
| Shared costs | `/admin/payroll/shared-costs` | Preview allocations, save, inspect and reverse entries |
| Calendar | `/admin/calendar` | Month dates, START/TODAY/END markers, current-month selection |
| Calculate | `/admin/payroll/calculate` | Calculate/recalculate selected working month |
| Export | `/admin/payroll/export` | Payslips and payroll exports; inspect every monetary line |
| Wallets | `/admin/wallets` | Send selected/all pay, duplicate prevention, adjustments and payout records |
| Currencies | `/admin/currencies` | Currency catalog, FX, manual rates and country mapping |
| Reports | `/admin/reports` | Payroll and client revenue reconciliation |
| Hours | `/admin/payroll/hours` | Session vs typed hours, reset, add/remove rows, group by worker/desktop/client, CSV import |
| Payee payouts | `/admin/clients/recipients` | Preview vs frozen rate, per-client lines, combined statement PDF, email, mark paid, undo, GS kept, earlier format |
| Financial Intelligence | `/leadership/financial` | Leadership totals and selected-period scope |
| Worker wallet | `/worker/wallet` | Own payslips, balance, transactions and payment notices |

Use the app's finance tabs rather than typing routes where possible. If a tab or action is absent on the deployed version, record that as a deployment mismatch.

### 17.3 Set up the test workspace

1. Sign in as an admin or super admin. In Settings, prepare and enable **Test Mode**. Wait until preparation finishes and verify the TEST indicator across pages.
2. In browser Network tools, verify normal finance requests carry `X-Test-Mode: 1` and responses identify Test Mode. The header alone is insufficient; the server checks the authenticated role.
3. A new private workspace contains reference currencies, FX, countries, platform settings and the tester's admin record. It does not copy the workforce, clients, tiers or work sessions. Empty pages are expected initially. New tables and columns (Hours Log, payees, income entries, payee payouts, client billing fields, session titles and rates, month bypass) are added to an existing workspace automatically when it is next used.
4. Create a USD working month covering October 2026 if the workspace has none. Create test clients, and link test desktop records to them for the desktop-hours cases. Do not connect to real desktops. On the Payees page, add the test payees, and a **Global Solutions** payee marked GS if the workspace has none.
5. Create the sample tiers described below. Open Test Month and create its five test workers. Assign explicit tiers to them; do not assume generated workers have rates.
6. Test Month copies the current real-type month's range within the active database, or uses the current calendar month if no current month exists. It is marked `is_test` and never becomes the regular current month.
7. Generate data for 7 and 8 October. Generation replaces that day's records; it does not add another copy. One worker is absent each seeded day, while the others receive work sessions of about four to six hours. Compute expected pay from the actual generated minutes, not a fixed six-hour assumption.
8. Use **Open as** on a test worker to exercise the worker frontend. Test workers are database fixtures, not independent login accounts. Clear the worker-view selection before returning to administration.
9. Configure test email recipients in Settings. Private Test Mode only emails the tester and the configured inboxes; this also applies to payee statements, so give test payees a permitted payout email. Verify the recipient and the TEST subject before sending.

**Test Mode and Test Month are different.** Test Mode isolates the database by admin account. Test Month isolates test workers and their payroll within whichever database is active. Use both together for this walkthrough. Resetting Test Month does not clear the entire private workspace; clearing Test Mode drops that private workspace.

### 17.4 Fixed data for arithmetic checks

Use these manually controlled values in a clean scenario, separate from random seeded hours.

| Record | Value |
|---|---|
| Month | 1-31 October 2026, reporting USD |
| Manual FX | 1 USD = 100 KES and 1 USD = 0.90 EUR; deliberately chosen test rates, not market quotes |
| Worker A | Company worker, 500 KES/hour, 10 payable hours on Desktop X1 |
| Worker B | Company worker, 800 KES/day, 8 payable hours |
| Worker C | Partner worker, USD 100 recorded earnings, 70% worker / 20% company / 10% partner |
| Worker A adjustments | Bonus 1,000 KES; transfer cost 100 KES; external cost 200 KES |
| Client X | Desktop X1 linked; billing rate USD 20/hour; desktop switch **on**; USD 190 client account payout on the Income tab; recipients: Owner X 40%, Global Solutions 60% |
| Client Y | No desktop; switch **off**; typed billed hours 5; client tier USD 30/hour; USD 5 one-off cost; nothing received yet; recipients: Owner Y 50%, Global Solutions 50% |
| Payees | Owner X: payout currency EUR, payout email a permitted test inbox. Owner Y: USD, payout details filled in. Global Solutions marked GS. |
| Other income | GBP 40 "Referral bonus" (other income), typed rate 0.80 GBP per USD |

**Workers.** A: base 5,000 KES; gross 6,000; deductions 300; net **5,700 KES**; reporting equivalent **USD 57**. B's hourly equivalent is 800 / 8 = 100 KES/hour, so base **800 KES**. C's worker share is USD 70, company USD 20, partner USD 10; convert the worker share into C's actual payout currency.

**Client X.** Billed hours 10 (from the Hours Log on X1); expected 10 × 20 = **USD 200**; received USD 190, so the variance is −10 (exactly 5%, no warning) and revenue is **USD 190**. Worker pay = 10 h × 500 KES ÷ 100 = **USD 50**; transfer = A's 100 KES ÷ 100 = **USD 1** (all of A's hours are on X1). Net distributable = 190 − 50 − 1 = **USD 139**. Owner X 40% = **USD 55.60**; Global Solutions 60% = **USD 83.40**. After approval: 55.60 × 0.90 = **€50.04**.

**Client Y.** Billed hours 5 (typed); the tier rate wins over any typed billing rate: expected 5 × 30 = **USD 150**; nothing received, so revenue is the expected **USD 150**. No desktop, so no worker pay or transfer; other costs USD 5. Net distributable = 150 − 5 = **USD 145**: Owner Y **USD 72.50**, Global Solutions **USD 72.50**.

**Other income.** GBP 40 at 0.80 = **USD 50.00**, frozen.

**Month overview** (with only these figures). Income pool = 190 + 50 = USD 240 (Y's expected income isn't income yet). Payee payouts = 55.60 + 72.50 = USD 128.10. Worker pay and expenses follow the payslips and costs actually present; GS keeps = income pool − payee payouts − worker pay − expenses.

### 17.5 Worker financial logic

- Session minutes come from `image_start_at` and `image_end_at`; seconds are floored to whole minutes. Desktop connected time and scheduled shifts are monitoring data, not pay.
- Closed sessions are selected by the session start timestamp inside the period's UTC bounds. Flagged/excluded sessions are omitted. A session linked to another payroll month is not reassigned.
- Session hours fill the Hours Log per worker per desktop. Payslip hours are the worker's Hours Log total. Typed rows survive recalculation; Reset returns a row to its session figure.
- Test workers are calculated only in test periods, and regular workers only in regular periods.
- A worker-specific effective rate wins over a tier rate. The calculation chooses the latest eligible rate through the period end; it does not prorate sessions by a mid-month rate change.
- The rate's currency is the payout currency. Country mapping supplies a fallback when no rate currency exists. A 500 KES/hour tier must remain 500 KES/hour, regardless of reporting currency.
- Day/week/month rates convert using 8/40/160 hours. Task rates are treated as the entered hourly equivalent; confirm this business rule before using task pricing commercially.
- Company pay plus converted partner share gives base pay; bonus increases gross; transfer and external costs reduce net. Values are rounded to two decimal places.
- Payroll follows open → calculated → approved → paid. Approve, reopen and mark paid are Super Admin only. Approval freezes FX and is refused while month checks are open and not bypassed. Reopening a non-paid month allows recalculation and clears any bypass. A paid month cannot be reopened.
- Wallet push requires approval; a Super Admin can approve a calculated month from the Wallets flow first. One payroll credit per worker/month is permitted; zero and negative nets are skipped.
- An admin-added session is closed and approved on creation, counts in the month of its date, and is refused for approved or paid months. With its own rate, the payslip adds hours × (session rate − worker's rate).
- An existing wallet balance may be converted when the payout currency changes, with conversion-out/in transactions. A missing FX rate can block that worker's credit.

### 17.6 Client financial logic

- Billed hours: sessions linked to the client when the switch is on; the typed figure when it is off. Turning the switch on ignores the typed figure; it is kept for when the switch goes off again.
- Rate: an active client tier (applies to clients or both) converted to USD per hour; otherwise the client's billing rate.
- Received is the sum of the client's income entries in USD (an entered zero counts as received). Revenue is received, otherwise expected.
- Income entries are frozen in USD at entry, at that day's rate or a typed one. Other income needs a description. The ledger's Received pencil only works when the client has at most one entry.
- `Net distributable = revenue − worker pay − transfer cost − (shared costs + one-off costs)`; `recipient amount = net distributable × %`, unless an amount was typed.
- Check is OK only when the % total exactly 100 and the amounts total exactly the net distributable. A negative net distributable is not clamped: a warning shows.
- Recipients are saved per client per month; a month without its own carries the latest earlier month's. Global Solutions' amount is kept, every other payee's is paid out.
- Client figures can be edited until a payee payout covering that client is marked paid, or the month is paid.
- Payee payouts: one per payee owed money, prepared on approval at that day's rate; amounts follow later ledger edits at the frozen rate; a changed amount sends a Sent statement back to To send; Paid is final until undone, and undo is impossible once the month is paid.

### 17.7 Frontend acceptance cases

Mark each case PASS, FAIL or BLOCKED. Keep screenshot, month/worker/client IDs, actual values and expected values for failures.

| ID | Action | Expected result |
|---|---|---|
| S01 | Enable private Test Mode; navigate through finance pages | TEST indicator remains; requests use sandbox; no real balances change |
| S02 | Generate the same Test Month day twice | Records are replaced; no doubled sessions or payroll |
| S03 | Open each test worker | Own worker view and identity; returning to admin clears impersonation |
| D01 | Filter every finance screen to October | Dates and totals all refer to October; switching month refreshes rows |
| D02 | Inspect Calendar on 8 October 2026 | START at 1, TODAY at 8, END at 31 for the standard range |
| D03 | Test just before/after period UTC bounds and cross-midnight sessions | Inclusion follows start timestamp; adjacent months do not double-pay |
| D04 | Change open-month dates, then approve and try again | Open edit allowed; approved/paid date edits rejected |
| D05 | Run month-rollover in a controlled local test with an injected date | Expired current month unpinned; covering new period selected/created; old status preserved |
| R01 | Assign 500 KES/hour tier and calculate A | 10h, 500 KES/hour, 5,000 KES base; no extra currency multiplication |
| R02 | Exercise hourly/day/week/month/task units | Correct hourly equivalents; task semantics documented |
| R03 | Assign a worker-specific rate | It overrides tier; history/effective dates retained |
| R04 | Change rate mid-month | Latest eligible month-end rate used; no implied daily proration |
| R05 | Create a client tier; try assigning it to a worker; change a used tier to workers-only | Worker assignment refused; scope change refused while in use |
| H01 | Complete 10 evidence hours but 12 connected hours | Paid hours 10; connection monitoring remains 12 |
| H02 | Remove one entered evidence timestamp | Session hours become zero; incomplete-evidence reminder is available |
| H03 | Flag/exclude a closed session; leave another open | These sessions do not contribute to the Hours Log or pay |
| H04 | Link a session to another month and calculate | It is not stolen or paid a second time |
| HL1 | Type 12 h on A's X1 row; recalculate | Row shows typed 12 with session 10; payslip hours 12; recalculation keeps 12 |
| HL2 | Reset the row | Back to 10; payslip hours 10 |
| HL3 | Type A's payslip hours as 8 in the Payroll ledger | Hours Log rows reduce to total 8; Hours page and payslip agree |
| HL4 | Add a "No desktop" row for C; import a CSV with a bad worker name | Row added; import reports the bad row without saving it |
| HL5 | Edit hours after the month is paid | Rejected |
| P01 | Enter A's bonus/costs and recalculate | Net 5,700 KES; edits preserved; row totals and worker PDF agree |
| P02 | Bulk-edit selected workers only | Only selected recipients and entered fields change |
| P03 | Calculate worker with no rate, no FX, no hours or missing partner earnings | Relevant warnings visible; no silent invented values |
| P04 | Create costs larger than pay | Negative-net warning; wallet push skips that row |
| P05 | Approve; change current FX | Official approved payslip retains frozen FX; display conversion may change |
| P06 | Reopen non-paid month; try reopening paid month | Non-paid reopens; paid is rejected |
| C01 | Set up Client X (switch on) and Client Y (switch off) | X billed 10 h from X1; Y billed the typed 5 h |
| C02 | Turn X's switch off with no typed hours | X has no billed hours and no expected; turning it on restores 10 h |
| C03 | Type USD 190 in X's Revenue pencil | One client account payout of USD 190 for X appears on the Income tab; expected 200, variance −10, revenue 190 |
| C04 | Give Y a client tier of USD 30/h and a typed billing rate of USD 25/h | Tier rate 30 used; expected 150; revenue 150 (expected) |
| C05 | Turn on Client split; add USD 5 other cost to Y | Y: total costs 5, net distributable 145, Owner Y 72.50, GS 72.50, Check OK |
| C06 | Check X with Client split on | Worker pay 50, transfer 1, net 139, Owner X 55.60, GS 83.40, Check OK |
| C07 | Received 20% below expected | Over-5% warning shown on the ledger |
| C08 | Apply other costs and desktop switch to selected clients | Only selected clients change; locked (paid) clients skipped |
| C09 | Reload the ledger; open it from a `?split=0` link | The Client split choice is remembered; the link overrides it |
| IN1 | Add GBP 40 other income with no description; then with "Referral bonus" and rate 0.80 | First refused; second saved at USD 50.00 |
| IN2 | Add a second client account payout for X; try the Revenue pencil | X's revenue is the total; the pencil is refused and points to the Income tab |
| IN3 | Change today's GBP rate | The saved GBP entry keeps USD 50.00 |
| IN4 | Check the Income tab totals | Income pool = sum of entries in USD; one total per category; the category filter narrows the list |
| R1 | Give X recipients 40 / 50 | Check split; warning "% add up to 90%"; month check listed |
| R2 | Add a third recipient | The new line suggests 10% |
| R3 | Type Owner X's amount as 60.00; then click auto | Check split while the amounts total 143.40; auto returns 55.60 and OK |
| R4 | Pick "+ New payee…" on a recipient | Payee created and selected; it appears on the Payees page |
| R5 | Set November with no recipients of its own | November shows "recipients from October" with the same % |
| PY1 | Remove Owner Y's payout details | "Missing payout details" on Payees; payee-details month check blocks approval |
| PY2 | Delete an unused payee; delete Owner X | Unused one is deleted; Owner X is archived and still on old payouts |
| PY3 | Try deleting Global Solutions; mark Owner Y as GS | Delete refused; GS mark moves to Owner Y (move it back afterwards) |
| AS1 | Add a 3 h session for A on 9 October for client X, desktop X1, at the tier rate | Approved, "Added by admin" badge; A's X1 Hours Log row rises by 3 h; X's billed hours rise by 3 h |
| AS2 | Add a 2 h session for A for client X, no desktop, at 700 KES/h | On A's "No desktop" Hours Log row; X billed 2 h; payslip adds 2 × 200 = 400 KES on top of hours × 500 |
| AS4 | Claim an RDP, then leave the session unlinked | Session shows "—"; month check "Session with no client"; no client billed until an admin links it |
| AS3 | Try adding a session to an approved month | Refused: reopen first |
| MC1 | Leave a desktop with hours but no client; open the Month tab | "Desktop with no client" check listed with Resolve to Desktops; Approve disabled |
| MC2 | As a Super Admin, bypass with a 3-character reason; then with a proper reason | First refused; second recorded with name, time and reason; Approve enabled |
| MC3 | After the bypass, open a new check (e.g. break X's split) | Approval blocked again until resolved or bypassed again |
| MC4 | Reopen the approved month | The bypass is cleared |
| SA1 | As a plain admin, open Payroll, the Month tab and Wallets | No Approve, Reopen or Mark paid; no Bypass; Wallets can't approve a calculated month |
| SA2 | As a plain admin, call approve/reopen/paid/bypass directly | Refused (403) |
| L01 | Preview USD 10 shared cost, workers 50%, clients 50%, two recipients in each group | USD 2.50 per recipient; preview makes no saved changes |
| L02 | Save it | Worker shares appear once on payslips; client shares appear in the ledger's Other costs and reduce the net distributable |
| L03 | Allocate USD 10 equally among three recipients | Rounded shares total exactly USD 10, not USD 9.99 or 10.02 |
| L04 | Use custom percentages with invalid totals or no recipients | Validation rejects invalid allocation |
| L05 | Delete a shared cost; attempt edit after approval | Open/calculated deletion reverses allocation; locked-period mutation rejected |
| A01 | Require membership approval; revoke one test worker | Worker sees unapproved status; protected RDP/shift access denied |
| A02 | Approve that member again | Access restored; this does not approve or pay the payroll month |
| CP1 | Open Payee payouts before approval | Preview rows at the stored rate; no send or pay actions |
| CP2 | As a Super Admin, approve the month | Owner X payout prepared: USD 55.60, EUR, rate 0.90, €50.04; Owner Y USD 72.50; GS amounts under "Kept by Global Solutions" |
| CP3 | Make Owner X a recipient on Y too (Owner Y 25%, Owner X 25%, GS 50%) | Owner X has one payout with 2 clients: 55.60 + 36.25 = USD 91.85; the toggle shows both lines |
| CP4 | Change the stored EUR rate, reload; then Refresh rates | Reload keeps 0.90; Refresh takes the new rate |
| CP5 | Download Owner X's statement | One PDF with a section per client; revenue, costs, net, % and share match the ledger; total in USD and EUR |
| CP6 | Email it to a permitted test inbox; then to a non-permitted address | Permitted: Sent, TEST subject, PDF attached, email history row; non-permitted: clear refusal, still To send |
| CP7 | Edit X's received after sending | Payout amount follows at the frozen rate; status back to To send |
| CP8 | Mark Owner X paid with a reference; try editing X and Y on the ledger | Paid with reference and date; both clients locked; Owner Y keeps the amount already worked out |
| CP9 | Undo the payment; mark the month paid; try undo again | First undo works; after the month is paid undo is refused |
| CP10 | Open a month paid before payees existed | Its per-client payouts show read-only under "Paid in the earlier format" |
| M01 | Open the Month tab through the steps | Each of the seven steps turns done at the right time; GS keeps = income pool − payee payouts − worker pay − expenses |
| M02 | Compare the Month tab worker pay with admin-added sessions | Worker pay splits into desktops and admin sessions; the parts add up |
| W01 | Send A's approved pay to wallet | Single credit 5,700 KES; balance increases; payment notice created |
| W02 | Repeat push and double-click/submit concurrently | No duplicate credit; inspect transactions, not just a success toast |
| W03 | Send pay to selected workers | Unselected balances unchanged; credited/skipped counts correct |
| W04 | Record payout and manual positive/negative adjustments with notes | Correct signed balance movement and transaction history |
| W05 | Change wallet currency with/without available FX | Successful conversion has out/in history; missing FX gives a clear skip/error |
| F01 | Switch admin display currency; inspect all finance pages | Display amounts change; stored values, input currency and worker amounts unchanged |
| F02 | Open A's worker wallet before/after approval and credit | Pending payslip marked not final; approved slip final; balance changes only on credit |
| F03 | Try another worker's payslip/summary URL | Access denied; own download works |
| E01 | Download individual PDF, ZIP and payroll export | Period, worker, hours, rate, bonus, costs, FX and net match stored summary |
| E02 | Send test payslip email; retry/re-send | Allowed test recipients only; TEST marking; delivery history and duplicate controls checked |
| I01 | Import clients with Client %, Client Tier, Desktop Hours and Payout columns | Values saved; unknown tier or bad currency reported per row |
| X01 | Leave Test Mode and refresh | Real data returns; private test balances absent from real reports |
| X02 | Reset Test Month; then clear private workspace | Correct scope removed; real records unchanged; cleanup status completes |

### 17.8 Date rules that need particular attention

The regular Calendar TODAY marker uses Africa/Nairobi. Payroll session selection uses UTC day boundaries. Test Month's frontend today helper uses browser-local dates, while backend automatic month creation uses the server's `date.today()` and checks hourly. These are not one unified timezone policy.

Example: 1 November at 00:30 Nairobi is 31 October at 21:30 UTC. Under the session-start filter, that session belongs to October. Test Nairobi midnight, UTC midnight, browser timezone changes, overnight evidence times, leap February and edited/custom periods. Do not change the production clock for rollover tests.

The work period dates, session start/end, evidence start/end, approval time, wallet-credit time, client received date, client paid date and external-payout recording time should be labeled separately. A November wallet credit or client payment for October work is legitimate and must still identify October as the work month.

### 17.9 Things to watch while testing

1. The wallet-credit logic checks for an existing transaction before inserting. Duplicate-click and concurrent-request tests are both required; a sequential repeat alone does not prove concurrency safety.
2. Monthly member approval is an access gate; it is not the payroll approval status or the session inclusion state.
3. Generated test sessions set evidence timestamps but do not exercise the real screenshot-upload flow. Test evidence capture separately if that is part of acceptance.
4. Worker pay on the client ledger uses each worker's payslip rate for the hours on sessions linked to that client. It is not the worker's full net pay (bonuses and costs are not spread across clients), so it will not reconcile exactly to wallet credits. The Month tab's worker pay is the payslip total. Unlinked sessions count toward the Hours Log / payslip but not toward any client.
5. Recipients are stored per month. Changing them in an old month only changes that month; later months that carry recipients forward pick up the change until they get their own.
6. An income entry's USD figure is frozen when entered. Changing today's rate does not move it; edit the entry (or type its rate) to change it.

### 17.10 Completion evidence

For each financial case retain: test workspace indicator, deployed version, selected period dates/status, worker and client setup, input values, calculation, resulting payslip, ledger row, payout and statement, wallet transactions and worker-view screenshot. Verify frontend totals against backend records or responses. Do not mark the system tested based solely on screenshots of populated tables.

Recommended run order: setup → dates → tiers/FX → evidence hours → Hours Log → payroll edits → payees → income → clients and ledger (split and recipients) → shared costs → admin-added sessions → month checks and bypass → member approvals → payroll approval (Super Admin) → payee payouts → wallet credit/payout → worker view → exports/email → cleanup.
