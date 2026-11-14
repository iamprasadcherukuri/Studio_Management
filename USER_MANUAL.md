# Photography Studio Management — User Manual

For studio administrators and staff. Updated 14 November 2026.

Live application: https://studio-management-sandy.vercel.app/

This manual describes the current application, including customer search, receipt discounts and the features delivered through migration 008. Available controls depend on your account role.

## 1. Quick start

For an administrator setting up the studio:

1. Sign in with your assigned email address and password.
2. Open **Settings → Studio Profile**, enter the studio details and save.
3. Review dropdown choices in **Settings → Master Management**.
4. Add packages and staff in the other Settings sections.
5. Add a customer, then create a booking for that customer.
6. Record money received through **Payments** and print or download its receipt.
7. Create an invoice when a billing document is needed.
8. Track equipment, album delivery and expenses as work progresses.
9. Review balances and reports regularly.

Existing users do not need a setup token. The first administrator setup screen is only for an installation with no accounts; the person maintaining the application supplies its setup token.

## 2. Sign in, passwords and logout

Enter your email and password on the sign-in screen. A newly created user receives a temporary password from the administrator. At first login, choose a different password when prompted, then sign in again.

New passwords must contain at least 12 characters and fit within the application's 72-character and 72-byte limits. Some non-English characters use more than one byte.

The signed-in user's details appear at the bottom of the left sidebar. Use the logout icon beside those details when finished. The moon/sun button in the upper-right corner switches the display theme.

If you forget your password, contact an administrator. An administrator can reset it from **Users**; the replacement temporary password must be changed at the next login. Resetting or changing a password invalidates older sessions. Disabling an account blocks its access; enabling it again requires a fresh sign-in.

## 3. Roles and access

| Feature | Administrator | Staff account |
| --- | --- | --- |
| Dashboard | Available | Available |
| Customers, bookings and albums | Manage | Manage, subject to role restrictions |
| Payments, reversals and invoices | Available | Restricted |
| Equipment and expenses | Available | Restricted |
| Reports, Settings and Users | Available | Restricted |
| Delete eligible records | Available where supported | Restricted |

A staff record under Settings represents a person who can be assigned to a booking. A user account under Users grants application access. Creating one does not automatically create the other.

## 4. Dashboard

Use the dashboard to review customer and booking counts, payments received, pending balances, cash flow and upcoming events. Click an upcoming booking to open its information.

Payments received are net of payment reversals. A payment discount reduces the amount owed but is not money received. Cash balance represents net receipts minus recorded paid expenses; it is not accounting profit.

## 5. Customers

### Add or update a customer

1. Open **Customers** and choose the add action.
2. Enter the required **Full name** and **Mobile number**.
3. Optionally select **Title** and **Gender**, then enter alternate mobile, email and address.
4. Save the customer.

Mobile fields accept 10 digits when supplied. Enter the number without spaces or a country-code prefix. Optional mobile fields may be left blank.

Use the edit action to correct details. Use customer history to review the customer's bookings, paid amounts and outstanding balances. Linked customer records cannot be deleted while referenced by bookings.

### Search and select an existing customer

In a form with **Search Customer**, type a full or partial name or mobile number. For example, `Ravi`, `Kumar` or `9876`.

The suggestions show **Name — Mobile number**. Search waits approximately 300 milliseconds after typing and returns up to 10 matches. Continue typing to narrow the results.

- Click a suggestion to select it.
- Use Arrow Down/Arrow Up to move through suggestions, Enter to select, and Escape to close the list.
- Changing the search text clears the previous selection. Select a matching customer again before saving.
- If no customer matches, check the spelling or add the customer from Customers first.

Typing into the search field does not create a customer. A valid existing customer must be selected.

## 6. Bookings

### Create a booking

1. Open **Bookings → Add booking**.
2. Search for and select the customer.
3. Select the event type and enter the event date and location.
4. Select a package if applicable and check the total booking amount.
5. Set the booking discount type and value, or choose **NONE** with a value of zero.
6. Review the calculated **Final agreed amount**.
7. Select a status, assign staff if needed, and add notes.
8. Save.

Discount types are **NONE**, **FIXED** (a rupee amount) and **PERCENTAGE**. The final agreed amount is the price after discounts; it is not the amount already paid.

### View, edit and filter

Search the list or filter by status and event-date range. Open a booking's details to review its information and financial balances. When editing, its existing customer is preselected.

The workflow statuses are **confirmed**, **in progress**, **completed** and **cancelled**. Update the status to reflect the actual event workflow; existing bookings remain in history.

Previously granted payment discounts are retained when editing a booking. The agreed amount cannot be reduced below net money already received.

### Rescheduling and cancellation

Changing an event date moves eligible future equipment reservations by the same date difference while preserving their duration. Conflicting reservations cause the change to be rejected. Equipment already issued must be returned before a change that the application blocks can proceed.

A booking with net receipts cannot be cancelled until those receipts have been fully reversed. Eligible future equipment reservations are marked cancelled with the booking; they are not recorded as physical returns. Review booking and equipment details after a successful change.

## 7. Payments, invoices and receipts

| Document or action | Purpose | Records money received? |
| --- | --- | --- |
| Invoice | Describes the booking's charges | No |
| Payment | Records money actually received | Yes |
| Payment receipt | Documents an existing payment | No additional money |
| Reversal | Records a refund or correction against a payment | Reduces net receipts |

The application records offline payments. Selecting UPI, bank transfer or another method documents the transaction; it does not transfer money or verify settlement with a bank.

### Record a payment

1. Open **Payments** and choose the add action.
2. Select the correct booking and check its outstanding amount.
3. Enter the payment date and the amount actually received.
4. If offering a new discount, select its additional discount type and value.
5. Choose the payment method and payment type, such as Advance, Partial or Final.
6. Enter the transaction/cheque reference and remarks where applicable.
7. Review the preview and save once.

The application rejects overpayments and payments against cancelled bookings. Monetary inputs support up to two decimal places. If a request fails or is still loading, check for an existing receipt before starting a separate entry. Retrying the same form submission is protected against creating another payment.

### Additional discount at payment time

This discount applies to the current outstanding balance. A percentage uses that balance as its calculation basis. It is additional to discounts already granted.

| Example | Amount |
| --- | ---: |
| Original package amount | ₹50,000.00 |
| Booking discount | −₹5,000.00 |
| Initial agreed amount | ₹45,000.00 |
| Previously received, net of reversals | −₹10,000.00 |
| Outstanding before this payment | ₹35,000.00 |
| Additional payment-time discount | −₹5,000.00 |
| Money received now | −₹10,000.00 |
| Remaining outstanding | **₹20,000.00** |

In this example the revised agreed amount is ₹40,000.00, cumulative discounts are ₹10,000.00, and net money received is ₹20,000.00. The discount is not an expense or a payment.

### Print or download a receipt

Use the receipt/PDF action for an existing payment. Preview the document, download it or use the print option. Reprinting does not create another payment.

New receipts use **REC-year** numbering; legacy numbers are retained. Receipts include booking/customer details, the recorded payment, applicable discounts and the issued balance information. Issued receipt snapshots preserve their original details; later payments or profile changes do not rewrite them. Legacy documents may have incomplete historical information.

### Correct a payment: full or partial reversal

1. Find the original payment and open **Payment reversals**.
2. Review the original amount, previous reversals and remaining reversible amount.
3. Enter the reversal date, amount and a clear reason.
4. Confirm the reversal.

A full reversal removes all remaining net cash from that payment. A partial reversal removes only the entered amount. Both preserve the original receipt and create a separate history record. Net receipts decrease and the booking's outstanding balance increases by the reversed cash amount.

Reversing cash does not automatically remove a payment-time discount. Do not record a second payment to undo a mistaken payment, or attempt to edit an issued receipt.

## 8. Invoices

1. Open **Invoices → Create invoice**.
2. Select the customer and booking as prompted.
3. Review invoice dates, line-item descriptions, quantities and prices.
4. Check the discount and total against the booking's current agreed amount.
5. Enter terms if required, then issue the invoice.
6. Open invoice details to review history or preview, print and download its PDF.

Only one active invoice is allowed per booking. Invoice items minus the invoice discount must equal the booking's agreed amount. Tax entry is currently disabled; the application does not calculate GST.

Issued financial details and items are protected. For a correction, use **Void** with a reason, then issue a replacement when appropriate. Voiding an invoice does not refund money. Existing booking payments carry through to a replacement without being entered again.

The invoice screen can show current payment balances, while its PDF preserves financial information captured at issuance. Later payments do not rewrite the issued PDF. Older invoices without a financial snapshot show historical figures as unavailable rather than inventing them.

## 9. Equipment

### Add and manage inventory

Open **Equipment**, add the asset, and enter its unique asset code, name, category and relevant purchase information. Use search and filters to locate assets. Open details to review assignment and maintenance history.

### Reserve and return equipment

1. Choose **Assign equipment** and select the asset and booking.
2. Enter the assignment and expected return dates. The range must include the booking's event date.
3. Save the reservation.
4. After physical return, use the return action and enter the actual return date.

Reservations cover full days, including both boundary dates. Overlapping active reservations, overdue unreturned equipment, maintenance and retirement can block a reservation. Actual returns cannot be future-dated or earlier than assignment.

### Maintenance and retirement

Record maintenance and update its status as servicing progresses. Completing maintenance returns the asset to availability. Completed services cannot be reopened; create a new service entry if needed.

Purchase and maintenance costs do not automatically create expenses. For a paid maintenance cost, explicitly record a paid Equipment expense from the maintenance entry, or link an existing matching Equipment expense. Each side can be linked only once; linked expenses are protected from edits and deletion.

Resolve reservations before maintenance or retirement. Retired assets remain in history and cannot be reassigned or edited.

## 10. Albums

1. Open **Albums** and add an album against a booking.
2. Enter its type, size, pages and printing cost estimate.
3. Enter an expected delivery date if known.
4. Update the workflow stage as work progresses.
5. When delivered, select **Delivered**, enter the actual delivery date and delivery acknowledgement, then save.

An actual delivery date cannot be in the future. New delivery against a cancelled booking is blocked. The printing cost is an estimate; record the actual paid printing expense separately under Expenses, once.

## 11. Expenses

Open **Expenses**, add the expense date, category, description, amount and payment method. Optionally link a booking and add remarks. Save only money actually paid.

Search and use the available date/category filters to review spending. Eligible expenses can be corrected or deleted by an administrator. Maintenance-linked expenses have additional protection to keep the service and expense records consistent.

Do not enter a booking advance as an expense, or enter the same paid cost both manually and again from maintenance.

## 12. Reports and CSV export

Open **Reports**, choose the report and date range, then review the results. Use the CSV export action to download available results for a spreadsheet. Dates at both ends of the selected range are included.

| Report | Date used for filtering |
| --- | --- |
| Receipt and receipt-period reports | Payment date |
| Expense and expense-category reports | Expense date |
| Booking, outstanding and customer reports | Event date |
| Album reports | Actual delivery date, or expected date when undelivered |

Outstanding reports show current balances for bookings within the selected event-date range. They are not a reconstruction of balances as they stood on a past date. Check the report type and date basis before comparing totals across reports.

## 13. Settings

Settings has exactly four independent sections. Click the **+** on a heading to expand it and **−** to collapse it. Several sections can stay open together. Keyboard users can focus a heading and activate it with Enter or Space.

### Studio Profile

Enter the studio name, phone, email and address. Configure the receipt tagline, authorized signatory name/title and footer message, then choose **Save studio details**.

A receipt logo must be PNG or JPEG, no larger than 100 KB and at most 2048 × 2048 pixels. Save after selecting or removing a logo. Signatory text is displayed with a blank signature line; the form does not capture a handwritten signature. Previously issued receipt branding is retained.

### Master Management

Select a master entity and manage its dropdown values. Examples include event types, payment methods, album types/sizes, expense/equipment categories, package types, customer titles and customer genders.

Use search and status filters to find values. Review usage and any restrictions before changing or deactivating a value. System-managed codes and referenced values may be protected. An inactive choice is not intended for new entries; historical records remain available.

### Packages

Add or edit the package name, optional type, price and description. Review the amount when selecting a package in a booking. A package referenced by a booking cannot be deleted.

### Staff

Add or edit the staff member's name, date of birth, email and address. Enter an optional 10-digit mobile number if available. Staff members can then be assigned to bookings. Staff referenced by bookings cannot be deleted.

## 14. User administration

1. Open **Users** and add a name, unique email and role.
2. Leave the temporary password blank to generate one, or enter a valid temporary password.
3. Save and securely share the temporary credentials. The password is shown once.
4. Ask the user to sign in and change it immediately.

Use the account actions to reset passwords or enable/disable access. A reset requires confirmation with the administrator's current password. You cannot disable yourself, and the system protects the last active administrator from removal or deactivation.

## 15. Troubleshooting

| Problem | What to do |
| --- | --- |
| Sign-in fails | Check email/password. Contact an administrator if the account is disabled or needs a reset. |
| Session expires or access is denied | Sign in again. If access remains denied, check your assigned role with an administrator. |
| No customer suggestions | Check name/mobile spelling, wait for search to finish, or add the customer first. Select an actual suggestion before saving. |
| Payment exceeds balance | Recheck the selected booking, previous receipts, reversals and new discount. Enter only money received. |
| Booking cannot be cancelled | Review net receipts and issued equipment. Reverse applicable receipts and return equipment where required. |
| Equipment reservation rejected | Check date range, overlapping reservations, overdue returns, servicing and retirement status. |
| Album cannot be marked Delivered | Supply a valid actual delivery date and acknowledgement; check the booking is not cancelled. |
| Record cannot be deleted | It may be referenced by another record. Preserve history and use the supported status action. |
| PDF or printing fails | Retry the document action after loading, check browser download permissions, and use the PDF preview's print/download controls. |
| Server/database error | Retry once and contact the application maintainer with the page, action, time and exact error. A failed load does not prove that records are absent. |

For a server/database error, the maintainer can check `/api/health` and deployment logs. Operational users should not run SQL, delete migration markers or change financial records to bypass an error. Never share passwords, temporary credentials or session tokens in screenshots or support messages.

## 16. Daily checklist

- Check upcoming events and staff/equipment assignments.
- Record actual receipts and issue the corresponding documents.
- Review outstanding balances before collecting the next payment.
- Update booking and album workflow stages.
- Record equipment returns and paid expenses.
- Review any reversals and their reasons.
- Check reports using the appropriate date basis.
- Log out when finished, especially on a shared computer.
