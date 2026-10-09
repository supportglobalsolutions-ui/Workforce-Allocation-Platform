# How the Money Works

A plain-language guide to the finance side of the platform: how hours become pay, how currencies are handled, how money reaches workers, and how each client's income is split and paid out. It describes the business rules only, not how they are built. The last section explains how to test all of it safely in Test Mode.

---

## 1. The big picture

**How things connect**

- **Desktops (RDPs)** host client accounts on platforms such as Outlier. Each desktop belongs to one client.
- **Clients** own those accounts. A client is one row of the old worksheet (for example "Marcel 1").
- **Workers** connect to desktops and work on the accounts. They are paid per hour by their tier.
- **GlobalSolutions (GS)** collects the platform payouts, pays the workers, and shares the income with each client by an agreed percentage.

**Every month follows the same path**

1. **Hours.** Workers log their sessions. The **Hours Log** adds them up per worker and desktop. Admins can correct any figure.
2. **Client earnings.** On the **Client ledger**, each client's billed hours, rate, expected income and the income actually received are recorded. The client's share is worked out from them.
3. **Worker pay.** The month is calculated: each worker's Hours Log total × their rate, plus bonus, minus costs.
4. **Approve.** An admin signs off. Exchange rates are frozen for workers and for client payouts.
5. **Pay workers.** Net pay goes to each worker's in-app wallet, then out in the real world.
6. **Pay clients.** Each client gets a statement in its own currency and is marked paid with a payment reference.

The **Month** tab under Payroll shows these six steps with counts and links, plus where the month's money went.

---

## 2. Currencies

### Our main currencies: US Dollar and British Pound

- The company reports in **US Dollars (USD)** and **British Pounds (GBP)**. These are the two "main" currencies and can never be removed.
- Each working month has a **reporting currency** (USD or GBP). A new month copies the previous month's choice, and starts as USD if there is none.
- **Client billing is always in USD.** Client rates, income, shares and costs are recorded in USD; only the final client payout is converted to the client's own currency.

### Local payout currencies

- Workers are paid in their **own local currency**, such as Kenyan Shillings, Ugandan Shillings or Nigerian Naira.
- Clients are paid in their **payout currency**, set on the client.
- Admins keep a **currency list** on the Currencies page. Only currencies on that list can be chosen for pay, and every one of them has an exchange rate.

### Where exchange rates come from

- **Automatic rates.** Rates are fetched from a free online exchange-rate service when:
  - an admin clicks **Refresh from API**
  - a new currency is added
  - a pay rate is set up in a new currency
  - payroll or a client payout needs a rate it doesn't have yet
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
| **Approved** | An admin has signed off. Exchange rates are frozen and the month's dates are locked. |
| **Paid** | Money has gone out. Nothing on the month can be edited any more. |

**Moving between statuses**

- **Calculate:** allowed while the month is open or calculated.
- **Approve:** allowed only after calculating.
- **Reopen:** sends the month back to open, unless it is already paid.
- **Mark paid:** allowed only after approval.

### Deleting a month

Deleting a month needs a one-time code that is emailed to the company's alert address and expires after 3 minutes.

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

### The Hours Log (Payroll → Hours)

The Hours Log is the **one place a month's hours live**. It has one row per worker per desktop:

- **Session figure:** the hours the worker's sessions add up to on that desktop. Sessions with no desktop (partner or third-party work) go to a **"No desktop"** row.
- **Hours:** the figure that counts. It starts as the session figure.
- **Typed by hand:** an admin can change any row, add a row, or import a CSV (Worker, Desktop, Hours, Note). A typed row shows the session figure next to it and has a **Reset** link to go back to it.

**When the log refreshes from sessions:** on Calculate, and whenever the Hours page or the payslip ledger is opened, while the month is **open** or **calculated**. Typed rows are never overwritten. An approved month keeps its hours and stops following sessions. A paid month can't be edited.

The page can be grouped by worker, by desktop or by client.

### Hours drive both sides of the money

- **Worker pay:** a payslip's hours are the worker's Hours Log total (all their rows).
- **Client billing:** with the client's **desktop hours** switch on, the client is billed for the Hours Log rows on its desktops (section 10).

Editing hours anywhere writes to the Hours Log, so the two always agree:

- Typing hours on a payslip, in Bulk edit or in the payslip ledger updates the worker's log rows. An increase goes on their busiest desktop (or a "No desktop" row); a decrease comes off the largest rows first.
- Editing the Hours Log updates the payslip's hours straight away.

**After calculating**, each counted session is tied to that month, so it can never be paid twice.

---

## 6. How pay is calculated

### Step 1: Company hours

> **Hours Log total × hourly rate**, in the worker's payout currency.

Hours typed above the session figure are paid at the same rate as session hours.

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
- **Row by row:** a spreadsheet-style ledger is available for wide edits.
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

## 7. Approval: freezing the exchange rate

When a month is **approved**:

- The exchange rate for each payslip is **frozen at that day's rate**. Later rate changes don't alter what was approved.
- Hand-locked payslips keep the rate the admin set.
- The reporting-currency figures are recalculated with the frozen rates.
- Payslip PDFs are rebuilt.
- **Client payouts are prepared:** each client's share is turned into a payout in the client's currency, at that day's rate (section 10).

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

The Email History page keeps a permanent record of every email sent, including client statements. It separates two questions:

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
2. If the month is only calculated, it is **approved first**, which freezes the rates and rebuilds the payslips.
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
2. The month is marked **Paid**.

---

## 10. Client income, the split and client payouts

### What each client holds

Set on the client (Clients page, or the client import):

- **Billing rate (USD/hr)**, or a **client tier** that overrides it.
- **Active?** and **Notes**.
- **Client %:** the client's agreed share of the income. GS keeps the rest. A change applies from the month it is made in; earlier months keep the % they had. Without one, the client's % is 0.
- **Desktop hours switch** (off by default):
  - **On:** the client is billed for the Hours Log rows on its desktops, automatically.
  - **Off:** the admin types the client's billed hours on the client ledger. A wrong or missing desktop link can't then produce wrong money.
  - Worker pay never depends on the switch.
- **Payout currency, payout email, payout method and payout details:** where and how the client's share is paid.

The **Sheet columns** toggle on the Clients page adds the tier, desktop-hours switch, client % and payout currency to the list without changing its default look.

**Client import.** The client import template has columns for all of these: Client %, Client Tier, Desktop Hours, Payout Currency, Payout Email, Payout Method and Payout Details.

- Client % can be written as `30`, `30%` or `0.3`.
- Desktop Hours takes yes/no.
- Client Tier must match the name of a tier that applies to clients.
- An unknown tier or currency is reported for that row, and the rest of the file still imports.
- An imported client % applies from the current month.

### The client ledger (Clients → Client ledger)

One row per client for the month, all in USD. Each row can be edited, or a change can be applied to the selected or visible clients at once (client %, costs, rate, desktop switch).

| Column | How it's worked out |
| :--- | :--- |
| Billed hours | Hours Log rows on the client's desktops (switch on), or the typed figure (switch off) |
| Rate | The client tier's hourly rate in USD, else the client's billing rate |
| **Expected** | billed hours × rate |
| **Received** | What the platform actually paid out, entered by the admin, with the date |
| Difference | received − expected |
| **Split on** | received if entered, otherwise expected |
| Costs | the client's part of shared costs (section 11) + any one-off cost charged to this client |
| **Client share** | split amount × client % − costs |
| **GS share** | split amount − client share |
| Worker cost *(information only)* | the hours on the client's desktops × each worker's rate, in USD |
| GS margin *(information only)* | GS share − worker cost − costs (GS pays those costs out) |

The split is taken **from gross**: the client's % is applied to the whole income, not to what is left after worker pay. Worker pay comes out of GS's share. Worker cost and margin are shown so GS can see how each client performs; they never change the client's share.

**Warnings on the ledger**

- Desktop hours is on but no desktop is linked, or the linked desktops have no hours.
- Hours but no billing rate.
- Received differs from expected by more than 5%.
- Costs are more than the client's share, so the client owes GS this month.
- No payout currency or payout details.

The Month overview adds two more: hours logged with no desktop, and desktops with hours but no client.

### Worked example: Marcel 1

Marcel 1 is billed at **$18.70/hour**, its client % is **30%**, and it is charged **$20** of costs this month. Its desktops logged **100 hours**.

| Line | Amount |
| :--- | :--- |
| Expected | 100 h × $18.70 = **$1,870.00** |
| Received | **$1,800.00** (difference −$70.00, under 5%, so no warning) |
| Split on | $1,800.00 (received was entered) |
| Client share before costs | $1,800 × 30% = $540.00 |
| **Client share** | $540 − $20 = **$520.00**, paid to Marcel 1 |
| **GS share** | $1,800 − $520 = **$1,280.00**: GS's 70% ($1,260) plus the $20 of costs it recovers |
| Worker pay | say 100 h × $8.00 = $800.00 |
| **GS margin** | $1,280 − $800 worker pay − $20 costs paid = **$460.00** |

If Marcel 1's payout currency is EUR and the rate frozen on approval is 1 USD = 0.92 EUR, its statement shows **€478.40**.

### Client payouts (Payroll → Client payouts)

- **Before approval** the page is a preview at the latest stored rate.
- **Approving the month** prepares one payout per client with a share: the client share in USD, the payout currency, the rate (frozen that day) and the local amount.
- If ledger figures change after approval, the payout amounts follow them, keeping the frozen rate. **Refresh rates** takes today's rates instead. An admin can also type a rate for one payout.
- **Statement:** a PDF showing hours, rate, expected, received, the split amount, the client %, the costs and the amount due in USD and in the client's currency. Download it, or **email** it to the client's payout email (one client, the ticked clients, or every unsent one). A statement whose amount changes after sending goes back to **To send**.
- **Mark paid** with a payment reference and date. From then on, that payout and that client's ledger row for the month are **locked**. **Undo** reverses a mistaken "paid" while the month itself is not yet marked paid.

| Payout status | Meaning |
| :--- | :--- |
| Preview | The month is not approved yet. |
| To send | Prepared, statement not sent (or the amount changed since). |
| Sent | Statement emailed. |
| Paid | Payment recorded. Locked. |

The **RDP earnings report** (Reports) still shows session hours × rate per desktop for monitoring. It no longer drives the client split.

---

## 11. Shared costs

Admins can enter a cost once for the month, such as software or internet, and share it out automatically (Payroll → Shared costs):

- **Who pays:** a chosen percentage goes to workers and the rest to clients.
- **Splitting within each group:** equally, or by custom percentages that add up to 100%.
- **Rounding:** cents are shared out so the parts always add up exactly to the total.
- **Workers:** each worker's part is converted to their currency and added to their bonus or costs on the payslip.
- **Clients:** each client's part is **charged to that client**: it shows in the ledger's Costs column and reduces the client's share.
- **Removing a cost:** reverses it.
- **When it can change:** only while the month is open or calculated.

A one-off cost for a single client is typed straight into that client's Costs on the client ledger.

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

The **Month** tab under Payroll (the Month overview) tracks steps 1 to 6 below. Each step shows whether it is done, any problems, and a link to the page that fixes it. The page also shows:

- **Totals for the month, in USD:** collected, client shares, costs, worker pay, and GS margin (collected − client shares − costs − worker pay).
- **A money-flow bar** splitting what was collected into client shares, worker pay, costs and margin.
- **A table of clients** with each one's hours, expected, received, client %, costs, client share, GS share, worker cost, margin and payout status.

**Before the month ends**

- Make sure the month exists on the Calendar or Finance page, in USD or GBP.
- Check tiers: worker tiers and who is on each, client tiers and which clients use them.
- Check each client's rate, client %, desktop-hours switch and payout details (the Clients page **Sheet columns** toggle shows them all).
- Check the Currencies page: every worker and client payout currency should be listed, with a current rate.
- Rate each worker's quality for the month. This feeds the leaderboard only, not pay.

**Closing the month**

1. **Hours.** Open Payroll → Hours. Fix hours logged with no desktop and desktops with no client. Type corrections where needed (they are kept), or import the month's hours sheet.
2. **Client earnings.** Open the Client ledger. Type billed hours for clients with the desktop switch off, then enter what each client actually received and when. Add any one-off costs. Clear the warnings.
3. **Worker pay.** Calculate (and recalculate if anything changes). Review the payslip warnings (no rate, no exchange rate, missing earnings and so on).
4. **Approve.** This freezes worker and client exchange rates and prepares the client payouts.
5. **Pay workers.** Send pay to wallets, email the payslips from the Receipts page, pay workers in the real world and record the payouts.
6. **Pay clients.** On Client payouts, check each amount, email the statements, pay each client and **mark it paid** with the reference.

Finally, **mark the month paid**. Nothing on it can change after that.

---

## 14. Safeguards and audit trail

- **No double pay.** A session can only be paid in one month, a worker can only be credited once per month, and a client payout can only be marked paid once.
- **One source of hours.** Payslip hours and client billed hours both come from the Hours Log, so they can't disagree. Typed hours are never overwritten by sessions.
- **Frozen history.** Approval freezes exchange rates for workers and clients. A paid client payout locks that client's month. Paid months can't be edited, and approved months can't have their dates changed.
- **Exact rounding.** Hours are rounded down to the whole minute, and partner and shared-cost splits always add up to the cent.
- **Protected deletion.** Deleting a working month needs an emailed one-time code.
- **Audit log.** Key money actions are recorded with who did them and when: hours edits and imports, client ledger edits, client statements sent, client payments and their undo, payout rate changes, and sending pay to wallets.

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
| **Payout currency** | The currency a worker or client is paid in. |
| **Tier** | A named rate with an amount, currency and unit. Worker tiers set pay; client tiers set a client's billing rate. |
| **Hours Log** | The month's hours per worker per desktop. The one source for payslip hours and client billed hours. |
| **Desktop hours switch** | Per client. On: billed hours come from the Hours Log on the client's desktops. Off: the admin types them. |
| **Expected** | A client's billed hours × its rate. |
| **Received** | What the work platform actually paid for the client's account that month. |
| **Split on** | The amount the client % is applied to: received if entered, otherwise expected. |
| **Client %** | The client's agreed share of the income. Stored as the client's revenue agreement. |
| **Client share** | Split amount × client % − costs charged to the client. What the client is paid. |
| **GS share** | Split amount − client share. Worker pay and GS's costs come out of it. |
| **GS margin** | GS share − worker pay − the costs GS pays out. |
| **Client statement** | The monthly PDF sent to a client showing how its share was worked out, in USD and its own currency. |
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
Hours Log (worker x desktop), with typed corrections
             |                                   |
Calculate payroll -> payslips          Client ledger: billed hours x rate = expected,
             |                         received, split on gross, client share / GS share
Bonuses / transfer costs / external costs / shared costs
             |                                   |
Approve: freeze FX for payslips and client payouts
             |                                   |
Credit wallets -> worker payslip,      Client payouts: statement PDF, email,
balance, history, notification         mark paid with reference (locks the client's month)
             |
External payment recorded as wallet payout -> mark month paid
```

The platform records money and allocations. A wallet credit is not a bank or mobile-money transfer, and marking a client paid does not move money. Monthly member approval (access), session payroll inclusion and payroll-month approval are three different decisions.

### 17.2 Pages to exercise

| Screen | Route | What to exercise |
|---|---|---|
| Settings | `/admin/settings` | Private Test Mode, preparation, permitted test email addresses, leave/clear workspace |
| Test Month | `/admin/payroll/test-month` | Create five test workers, select days, generate records, open worker view, reset/delete |
| Workers | `/admin/workers` | Worker type, country, status, tier assignment and individual pay terms |
| Clients | `/admin/clients` | Rate, client tier, client %, desktop switch, payout fields, Sheet columns toggle, linked desktops, import |
| Client ledger | `/admin/clients/ledger` | Billed hours, received income, costs, client %, apply to many, warnings |
| Payroll | `/admin/payroll` | Month filter, worker detail, manual edits, Bulk edit, Apply to many, calculation and warnings |
| Tiers | `/admin/payroll/tiers` | Rate, currency, unit, applies-to, worker and client assignment |
| Shared costs | `/admin/payroll/shared-costs` | Preview allocations, save, inspect and reverse entries |
| Monthly approvals | `/admin/payroll/approvals` | Require membership approval; approve/revoke selected members |
| Calendar | `/admin/calendar` | Month dates, START/TODAY/END markers, current-month selection |
| Calculate | `/admin/payroll/calculate` | Calculate/recalculate selected working month |
| Export | `/admin/payroll/export` | Payslips and payroll exports; inspect every monetary line |
| Wallets | `/admin/wallets` | Send selected/all pay, duplicate prevention, adjustments and payout records |
| Currencies | `/admin/currencies` | Currency catalog, FX, manual rates and country mapping |
| Reports | `/admin/reports` | Payroll and client revenue reconciliation |
| Hours | `/admin/payroll/hours` | Session vs typed hours, reset, add/remove rows, group by worker/desktop/client, CSV import |
| Month | `/admin/payroll/month` | Six-step checklist, KPIs, money-flow bar, per-client table |
| Client payouts | `/admin/payroll/client-payouts` | Preview vs frozen rate, statement PDF, email, mark paid, undo |
| Financial Intelligence | `/leadership/financial` | Leadership totals and selected-period scope |
| Worker wallet | `/worker/wallet` | Own payslips, balance, transactions and payment notices |

Use the app's finance tabs rather than typing routes where possible. If a tab or action is absent on the deployed version, record that as a deployment mismatch.

### 17.3 Set up the test workspace

1. Sign in as an admin or super admin. In Settings, prepare and enable **Test Mode**. Wait until preparation finishes and verify the TEST indicator across pages.
2. In browser Network tools, verify normal finance requests carry `X-Test-Mode: 1` and responses identify Test Mode. The header alone is insufficient; the server checks the authenticated role.
3. A new private workspace contains reference currencies, FX, countries, platform settings and the tester's admin record. It does not copy the workforce, clients, tiers or work sessions. Empty pages are expected initially. New tables and columns (Hours Log, client payouts, client billing fields) are added to an existing workspace automatically when it is next used.
4. Create a USD working month covering October 2026 if the workspace has none. Create test clients, and link test desktop records to them for the desktop-hours cases. Do not connect to real desktops.
5. Create the sample tiers described below. Open Test Month and create its five test workers. Assign explicit tiers to them; do not assume generated workers have rates.
6. Test Month copies the current real-type month's range within the active database, or uses the current calendar month if no current month exists. It is marked `is_test` and never becomes the regular current month.
7. Generate data for 7 and 8 October. Generation replaces that day's records; it does not add another copy. One worker is absent each seeded day, while the others receive work sessions of about four to six hours. Compute expected pay from the actual generated minutes, not a fixed six-hour assumption.
8. Use **Open as** on a test worker to exercise the worker frontend. Test workers are database fixtures, not independent login accounts. Clear the worker-view selection before returning to administration.
9. Configure test email recipients in Settings. Private Test Mode only emails the tester and the configured inboxes; this also applies to client statements, so give test clients a permitted payout email. Verify the recipient and the TEST subject before sending.

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
| Client X | Desktop X1 linked; billing rate USD 20/hour; desktop switch **on**; client % 40; received USD 190; payout currency EUR |
| Client Y | No desktop; switch **off**; typed billed hours 5; client tier USD 30/hour; client % 50; USD 5 one-off cost; nothing received yet |

**Workers.** A: base 5,000 KES; gross 6,000; deductions 300; net **5,700 KES**; reporting equivalent **USD 57**. B's hourly equivalent is 800 / 8 = 100 KES/hour, so base **800 KES**. C's worker share is USD 70, company USD 20, partner USD 10; convert the worker share into C's actual payout currency.

**Client X.** Billed hours 10 (from the Hours Log on X1); expected 10 × 20 = **USD 200**; received USD 190, so the difference is −10 (exactly 5%, no warning); split on 190; client share 190 × 40% = **USD 76**; GS share **USD 114**. Worker cost (information only) = 10 h × 500 KES ÷ 100 = USD 50; margin USD 64. After approval: 76 × 0.90 = **€68.40**.

**Client Y.** Billed hours 5 (typed); the tier rate wins over any typed billing rate: expected 5 × 30 = **USD 150**; nothing received, so the split is on expected; client share 150 × 50% − 5 = **USD 70**; GS share **USD 80**.

### 17.5 Worker financial logic

- Session minutes come from `image_start_at` and `image_end_at`; seconds are floored to whole minutes. Desktop connected time and scheduled shifts are monitoring data, not pay.
- Closed sessions are selected by the session start timestamp inside the period's UTC bounds. Flagged/excluded sessions are omitted. A session linked to another payroll month is not reassigned.
- Session hours fill the Hours Log per worker per desktop. Payslip hours are the worker's Hours Log total. Typed rows survive recalculation; Reset returns a row to its session figure.
- Test workers are calculated only in test periods, and regular workers only in regular periods.
- A worker-specific effective rate wins over a tier rate. The calculation chooses the latest eligible rate through the period end; it does not prorate sessions by a mid-month rate change.
- The rate's currency is the payout currency. Country mapping supplies a fallback when no rate currency exists. A 500 KES/hour tier must remain 500 KES/hour, regardless of reporting currency.
- Day/week/month rates convert using 8/40/160 hours. Task rates are treated as the entered hourly equivalent; confirm this business rule before using task pricing commercially.
- Company pay plus converted partner share gives base pay; bonus increases gross; transfer and external costs reduce net. Values are rounded to two decimal places.
- Payroll follows open → calculated → approved → paid. Approval freezes FX. Reopening a non-paid month allows recalculation. A paid month cannot be reopened.
- Wallet push requires approval; the Wallets flow can approve a calculated month first. One payroll credit per worker/month is permitted; zero and negative nets are skipped.
- An existing wallet balance may be converted when the payout currency changes, with conversion-out/in transactions. A missing FX rate can block that worker's credit.

### 17.6 Client financial logic

- Billed hours: Hours Log rows on the client's desktops when the switch is on; the typed figure when it is off. Turning the switch on ignores the typed figure; it is kept for when the switch goes off again.
- Rate: an active client tier (applies to clients or both) converted to USD per hour; otherwise the client's billing rate.
- Split on received when entered (an entered zero counts as received), otherwise on expected.
- `Client share = split amount × client % − (shared costs + one-off costs)`; `GS share = split amount − client share`. No client % on file means 0%.
- Negative client shares are not clamped: a warning says the client owes GS.
- Worker cost and margin are information only; they never change the client's share.
- Client figures can be edited until that client's payout is marked paid or the month is paid.
- Client payouts: prepared on approval at that day's rate; amounts follow later ledger edits at the frozen rate; a changed amount sends a Sent statement back to To send; Paid is final until undone, and undo is impossible once the month is paid.

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
| HL3 | Type A's payslip hours as 8 in Bulk edit | Hours Log rows reduce to total 8; Hours page and payslip agree |
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
| C03 | Enter USD 190 received for X | Expected 200, difference −10, split on 190, client share 76, GS share 114 |
| C04 | Give Y a client tier of USD 30/h and a typed billing rate of USD 25/h | Tier rate 30 used; expected 150 |
| C05 | Add USD 5 one-off cost to Y; save | Client share 70, GS share 80; costs larger than share shows the owes-GS warning |
| C06 | Change X's client % to 50 in October | October uses 50; September keeps its old % |
| C07 | Received 20% below expected | Over-5% warning shown on ledger and month overview |
| C08 | Apply client % and desktop switch to selected clients | Only selected clients change; locked (paid) clients skipped |
| L01 | Preview USD 10 shared cost, workers 50%, clients 50%, two recipients in each group | USD 2.50 per recipient; preview makes no saved changes |
| L02 | Save it | Worker shares appear once on payslips; client shares appear in the ledger Costs and reduce client share |
| L03 | Allocate USD 10 equally among three recipients | Rounded shares total exactly USD 10, not USD 9.99 or 10.02 |
| L04 | Use custom percentages with invalid totals or no recipients | Validation rejects invalid allocation |
| L05 | Delete a shared cost; attempt edit after approval | Open/calculated deletion reverses allocation; locked-period mutation rejected |
| A01 | Require membership approval; revoke one test worker | Worker sees unapproved status; protected RDP/shift access denied |
| A02 | Approve that member again | Access restored; this does not approve or pay the payroll month |
| CP1 | Open Client payouts before approval | Preview rows at the stored rate; no send or pay actions |
| CP2 | Approve the month | X payout prepared: USD 76, EUR, rate 0.90, €68.40; rate shown as frozen |
| CP3 | Change the stored EUR rate, reload; then Refresh rates | Reload keeps 0.90; Refresh takes the new rate |
| CP4 | Download X's statement | Hours, rate, expected, received, split amount, %, costs and amounts match the ledger |
| CP5 | Email X's statement to a permitted test inbox; then to a non-permitted address | Permitted: Sent, TEST subject, PDF attached, email history row; non-permitted: clear refusal, still To send |
| CP6 | Edit X's received after sending | Payout amount follows at the frozen rate; status back to To send |
| CP7 | Mark X paid with a reference; try editing X on the ledger | Paid with reference and date; ledger edit refused; Month overview counts X paid |
| CP8 | Undo X's payment; mark the month paid; try undo again | First undo works; after the month is paid undo is refused |
| M01 | Open the Month tab through the steps | Each step turns done at the right time; collected = client shares + costs + worker pay + margin |
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
4. Worker cost on the client ledger uses each worker's payslip rate for the hours on that client's desktops. It is not the worker's full net pay (bonuses and costs are not spread across clients), so it will not reconcile exactly to wallet credits.
5. Client % changes are stored from the month they are made in. Editing an old month's % creates an agreement starting that month, which also applies to later months until another change.

### 17.10 Completion evidence

For each financial case retain: test workspace indicator, deployed version, selected period dates/status, worker and client setup, input values, calculation, resulting payslip, ledger row, payout and statement, wallet transactions and worker-view screenshot. Verify frontend totals against backend records or responses. Do not mark the system tested based solely on screenshots of populated tables.

Recommended run order: setup → dates → tiers/FX → evidence hours → Hours Log → payroll edits → clients and ledger → shared costs → member approvals → payroll approval → client payouts → wallet credit/payout → worker view → exports/email → month overview → cleanup.
