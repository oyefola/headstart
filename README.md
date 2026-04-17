# Headstart

Headstart is a Google Calendar add-on that creates private buffered "shadow" events before the user's real calendar events. It is designed around a copy-and-hide model: the original event stays socially accurate and unchanged, while the user gets a separate actionable event that starts earlier.

## What It Does

- Creates buffered events before source events based on travel or online-meeting rules.
- Supports one-off event buffering from the Calendar event-open surface.
- Supports batch and background sync across selected calendars.
- Preserves shared event integrity by leaving the source event unchanged.
- Carries forward useful context, including notes and conference links when possible.

## Project Structure

- [controller.js](/Users/folademiladeoyeleke/headstart-local/controller.js): add-on entrypoints and action handlers.
- [userInterface.js](/Users/folademiladeoyeleke/headstart-local/userInterface.js): CardService UI construction.
- [calendarApiWrapper.js](/Users/folademiladeoyeleke/headstart-local/calendarApiWrapper.js): calendar writes, shadow linking, conference sync.
- [conferenceDetailsService.js](/Users/folademiladeoyeleke/headstart-local/conferenceDetailsService.js): advanced Calendar API conference lookup.
- [eventContextFactory.js](/Users/folademiladeoyeleke/headstart-local/eventContextFactory.js): event classification and normalized context extraction.
- [bufferDecisionService.js](/Users/folademiladeoyeleke/headstart-local/bufferDecisionService.js): online vs physical buffer policy.
- [backgroundProcessing.js](/Users/folademiladeoyeleke/headstart-local/backgroundProcessing.js): batch sync and orphan pruning.
- [settingsManager.js](/Users/folademiladeoyeleke/headstart-local/settingsManager.js): user settings and sync state persistence.
- [shadowDescriptionBuilder.js](/Users/folademiladeoyeleke/headstart-local/shadowDescriptionBuilder.js): buffered event description formatting.
- [transitMath.js](/Users/folademiladeoyeleke/headstart-local/transitMath.js): travel estimation helpers.

## Local Workflow

Run tests:

```bash
npm test -- --runInBand
```

Run coverage:

```bash
npm run test:coverage
```



## Test Suite

The local suite lives in [__tests__](/Users/folademiladeoyeleke/headstart-local/__tests__).

- [appSettings.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/appSettings.test.js): persistence defaults and sync-state formatting.
- [backgroundProcessing.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/backgroundProcessing.test.js): batch recalculation and skip logic.
- [bufferDecisionService.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/bufferDecisionService.test.js): online/physical buffer policy branches.
- [calendarApiWrapper.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/calendarApiWrapper.test.js): shadow linking, exact instance resolution, conference copy.
- [conferenceDetailsService.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/conferenceDetailsService.test.js): advanced conference lookup and fallback behavior.
- [controller.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/controller.test.js): event-open routing, per-event actions, manual data entry.
- [eventContextFactory.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/eventContextFactory.test.js): event-type inference and link/location normalization.

## Requirements Traceability

These requirements are taken from Chapter 3 of `dissertation_draft.tex`.

| Requirement | Meaning | Main implementation | Main tests |
| --- | --- | --- | --- |
| FR1.1 | Dynamic offset calculation | [bufferDecisionService.js](/Users/folademiladeoyeleke/headstart-local/bufferDecisionService.js), [transitMath.js](/Users/folademiladeoyeleke/headstart-local/transitMath.js) | [bufferDecisionService.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/bufferDecisionService.test.js) |
| FR1.2 | Buffered event starts earlier than the source | [calendarApiWrapper.js](/Users/folademiladeoyeleke/headstart-local/calendarApiWrapper.js) | [calendarApiWrapper.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/calendarApiWrapper.test.js) |
| FR1.3 | Original details remain accessible | [shadowDescriptionBuilder.js](/Users/folademiladeoyeleke/headstart-local/shadowDescriptionBuilder.js) | [calendarApiWrapper.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/calendarApiWrapper.test.js) |
| FR2.1 | Works for invited events | [controller.js](/Users/folademiladeoyeleke/headstart-local/controller.js), [backgroundProcessing.js](/Users/folademiladeoyeleke/headstart-local/backgroundProcessing.js) | [controller.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/controller.test.js), [backgroundProcessing.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/backgroundProcessing.test.js) |
| FR2.2 | Supports shared/subscribed calendars | [controller.js](/Users/folademiladeoyeleke/headstart-local/controller.js), [calendarApiWrapper.js](/Users/folademiladeoyeleke/headstart-local/calendarApiWrapper.js) | [controller.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/controller.test.js), [calendarApiWrapper.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/calendarApiWrapper.test.js) |
| FR2.3 | Supports self-scheduled events | [controller.js](/Users/folademiladeoyeleke/headstart-local/controller.js) | [controller.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/controller.test.js) |
| FR2.4 | Excludes online meetings by default | [bufferDecisionService.js](/Users/folademiladeoyeleke/headstart-local/bufferDecisionService.js) | [bufferDecisionService.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/bufferDecisionService.test.js) |
| FR2.5 | Allows online override | [controller.js](/Users/folademiladeoyeleke/headstart-local/controller.js) | [controller.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/controller.test.js) |
| FR3.1 | Leaves the source event unchanged | [calendarApiWrapper.js](/Users/folademiladeoyeleke/headstart-local/calendarApiWrapper.js) | [calendarApiWrapper.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/calendarApiWrapper.test.js) |
| FR4.1 | Supports per-event override | [controller.js](/Users/folademiladeoyeleke/headstart-local/controller.js), [userInterface.js](/Users/folademiladeoyeleke/headstart-local/userInterface.js) | [controller.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/controller.test.js), [eventContextFactory.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/eventContextFactory.test.js) |
| FR4.2 | Supports selective tailoring/suppression | Partially addressed through per-event and settings-based control | [controller.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/controller.test.js), [bufferDecisionService.test.js](/Users/folademiladeoyeleke/headstart-local/__tests__/bufferDecisionService.test.js) |

## Current Local Testing limitations

The local test suite covers the major application paths, but it is still a unit-style harness around mocked Apps Script globals. 
