/**
 * Generates all CardService UIs.
 */
class UIBuilder {
  constructor(settings) {
    this.settings = settings;
  }

  /**
   * Smart Label Generator
   * Uses native TextParagraph to seamlessly wrap long titles above input fields,
   * avoiding the truncation issue of native input titles without overflowing the screen.
   */
  _createLabel(title, hint) {
    let finalHtml = "<b>" + title + "</b>";
    if (hint) {
      finalHtml += "<br><i><font color=\"#5f6368\">" + hint + "</font></i>";
    }
    return CardService.newTextParagraph().setText(finalHtml);
  }

  _createActionButton(text, functionName, options) {
    const buttonOptions = options || {};
    const action = CardService.newAction().setFunctionName(functionName);

    if (buttonOptions.parameters) {
      action.setParameters(buttonOptions.parameters);
    }

    const button = CardService.newTextButton()
      .setText(text)
      .setOnClickAction(action);

    if (buttonOptions.style) {
      button.setTextButtonStyle(buttonOptions.style);
    }

    if (buttonOptions.backgroundColor) {
      button.setBackgroundColor(buttonOptions.backgroundColor);
    }

    return button;
  }

  _createFixedFooter(primaryButton, secondaryButton) {
    const footer = CardService.newFixedFooter().setPrimaryButton(primaryButton);
    if (secondaryButton) {
      footer.setSecondaryButton(secondaryButton);
    }
    return footer;
  }

  _buildBufferParameters(calId, evId, actionContext, extraParameters) {
    const context = actionContext || {};
    const extra = extraParameters || {};

    return {
      calendarId: calId,
      eventId: evId,
      eventApiId: context.eventApiId || "",
      recurringEventId: context.recurringEventId || "",
      eventStart: context.eventStart || "",
      eventEnd: context.eventEnd || "",
      eventConferenceData: context.eventConferenceData || "",
      eventHangoutLink: context.eventHangoutLink || "",
      ...extra
    };
  }

  createDashboardCard(appSettings) {
    const builder = CardService.newCardBuilder();
    const syncState = appSettings.getSyncState();
    
    const statusSection = CardService.newCardSection().setHeader("Auto-Sync Status");
    if (syncState.lastStatus) {
      statusSection.addWidget(this._createLabel("⏱️ Last Successful Run", syncState.lastStatus.replace(/\n/g, '<br>')));
    } else {
      statusSection.addWidget(this._createLabel("No Sync History", "Click 'Sync Calendars' below to start."));
    }
    
    const calSection = CardService.newCardSection().setHeader("Select Calendars");
    calSection.addWidget(this._createLabel("Schedules to Buffer", "Choose which calendars Headstart should create buffers for."));
    
    const calendars = CalendarApp.getAllCalendars();
    const checkboxGroup = CardService.newSelectionInput().setType(CardService.SelectionInputType.CHECK_BOX).setFieldName("selectedCalendars");
    
    let count = 0;
    for (let i = 0; i < calendars.length; i++) {
      const cal = calendars[i];
      if (cal.isMyPrimaryCalendar()) {
        const isChecked = syncState.savedIds ? (syncState.savedIds.indexOf(cal.getId()) !== -1) : true; 
        checkboxGroup.addItem("★ " + cal.getName() + " (Main)", cal.getId(), isChecked);
        count++;
      }
    }
    for (let i = 0; i < calendars.length; i++) {
      const cal = calendars[i];
      if (cal.getName() === CONFIG.CALENDAR_NAME || cal.isMyPrimaryCalendar()) continue; 
      const isChecked = syncState.savedIds ? (syncState.savedIds.indexOf(cal.getId()) !== -1) : false; 
      checkboxGroup.addItem(cal.getName(), cal.getId(), isChecked);
      count++;
    }
    
    if (count > 0) calSection.addWidget(checkboxGroup);
    calSection.setCollapsible(true).setNumUncollapsibleWidgets(1);
        
    const actionSection = CardService.newCardSection().setHeader("Actions");
    actionSection.addWidget(this._createLabel("Background Sync", "This automatically enables a daily background sync."));
    actionSection.addWidget(this._createActionButton("Sync Calendars", "handleBatchSync", {
      style: CardService.TextButtonStyle.FILLED,
      backgroundColor: CONFIG.GOOGLE_BLUE
    }));

    builder.addSection(statusSection);
    builder.addSection(calSection);
    builder.addSection(actionSection);
    builder.setFixedFooter(this._createFixedFooter(
      this._createActionButton("Tutorial", "onNavigateToTutorial", {
        style: CardService.TextButtonStyle.FILLED_TONAL
      }),
      this._createActionButton("Settings", "onNavigateToSettings", {
        style: CardService.TextButtonStyle.OUTLINED
      })
    ));
    return builder.build();
  }

  createInitialContextCard(event, calId, evId, existingShadow, options) {
    const cardOptions = options || {};
    const actionContext = cardOptions.actionContext || {};
    const builder = CardService.newCardBuilder();
    const header = CardService.newCardHeader()
      .setTitle(event.getTitle() || "No Title")
      .setSubtitle("Headstart Buffer")
      .setImageUrl("https://raw.githubusercontent.com/oyefola/dissertation-doc/refs/heads/main/images/Untitled%20(4).png");
    builder.setHeader(header);
    builder.setDisplayStyle(CardService.DisplayStyle.REPLACE);
    
    const section = CardService.newCardSection();
    
    if (existingShadow) {
      section.addWidget(this._createLabel("✅ Buffer Active", "A buffered event has already been created for this event."));
      section.addWidget(this._createActionButton("Refresh Buffer", cardOptions.requiresModeSelection ? "onShowBufferModeSelection" : "handleCreateBuffer", {
        parameters: this._buildBufferParameters(calId, evId, actionContext, cardOptions.requiresModeSelection ? {
          physicalLocation: cardOptions.physicalLocation || "",
          meetingLink: cardOptions.meetingLink || ""
        } : {}),
        style: CardService.TextButtonStyle.FILLED,
        backgroundColor: CONFIG.GOOGLE_BLUE
      }));
    } else {
      section.addWidget(this._createLabel("Create Buffer", "The buffer can now be calculated using your current settings."));
      section.addWidget(this._createActionButton("Create Buffer", "handleCreateBuffer", {
        parameters: this._buildBufferParameters(calId, evId, actionContext),
        style: CardService.TextButtonStyle.FILLED,
        backgroundColor: CONFIG.GOOGLE_BLUE
      }));
    }
    
    builder.addSection(section);
    return builder.build();
  }

  createDisambiguationCard(calId, evId, physicalLoc, meetingLink, actionContext) {
    const builder = CardService.newCardBuilder();
    const section = CardService.newCardSection();
    
    section.addWidget(this._createLabel("Attendance Mode", "Both a location and a link were found. Which one should Headstart use for your buffer?"));

    builder.addSection(section);
    builder.setFixedFooter(this._createFixedFooter(
      this._createActionButton("🏃 In Person", "handleCreateBuffer", {
        parameters: this._buildBufferParameters(calId, evId, actionContext, {
          attendanceMode: 'physical',
          resolvedLocation: physicalLoc
        }),
        style: CardService.TextButtonStyle.FILLED,
        backgroundColor: CONFIG.GOOGLE_BLUE
      }),
      this._createActionButton("💻 Online", "handleCreateBuffer", {
        parameters: this._buildBufferParameters(calId, evId, actionContext, {
          attendanceMode: 'online',
          resolvedLocation: meetingLink
        }),
        style: CardService.TextButtonStyle.OUTLINED
      })
    ));
    return builder.build();
  }

  createManualDetailsCard(calId, evId, actionContext, options) {
    const cardOptions = options || {};
    const builder = CardService.newCardBuilder();
    const section = CardService.newCardSection();

    section.addWidget(this._createLabel(
      cardOptions.isUpdate ? "Add Missing Event Details" : "Add Event Details",
      cardOptions.isUpdate
        ? "This event still has no location or conferencing. Add one or both, then refresh the buffer."
        : "This event has no location or conferencing. Add one or both so Headstart can calculate the right buffer."
    ));
    section.addWidget(this._createLabel("Location", "Optional. Add a physical destination for in-person attendance."));
    section.addWidget(CardService.newTextInput()
      .setFieldName("manualPhysicalLocation")
      .setValue(cardOptions.manualPhysicalLocation || ""));
    section.addWidget(this._createLabel("Meeting Link", "Optional. Add a Zoom, Meet, Teams, or other conferencing link."));
    section.addWidget(CardService.newTextInput()
      .setFieldName("manualMeetingLink")
      .setValue(cardOptions.manualMeetingLink || ""));
    section.addWidget(CardService.newTextParagraph().setText("<i>If you enter both, Headstart will ask which one to use for the buffer.</i>"));

    builder.addSection(section);
    builder.setFixedFooter(this._createFixedFooter(
      this._createActionButton(cardOptions.isUpdate ? "Continue Refresh" : "Continue", "onContinueBufferSetup", {
        parameters: this._buildBufferParameters(calId, evId, actionContext),
        style: CardService.TextButtonStyle.FILLED,
        backgroundColor: CONFIG.GOOGLE_BLUE
      })
    ));
    return builder.build();
  }

  createSuccessCard(wasUpdate) {
    const builder = CardService.newCardBuilder();
    const section = CardService.newCardSection();
    
    section.addWidget(this._createLabel(
      wasUpdate ? "✅ Buffer Refreshed" : "✅ Buffer Created",
      wasUpdate
        ? "Headstart has refreshed the buffer in your schedule."
        : "Headstart has added the buffer to your schedule."
    ));
    
    section.addWidget(CardService.newTextParagraph().setText("<i><b>Note:</b> Buffered event reminders follow your Headstart settings. If the original event still has alerts, you may want to mute it to avoid double notifications.</i>"));
    
    builder.addSection(section);
    return builder.build();
  }

  createSettingsCard() {
    const builder = CardService.newCardBuilder();
    
    const bufferSection = CardService.newCardSection().setHeader("Online Event Rules").setCollapsible(true).setNumUncollapsibleWidgets(2);
    bufferSection.addWidget(CardService.newDecoratedText().setText("Apply buffer to online meetings?")
      .setSwitchControl(CardService.newSwitch().setFieldName("setting_buffer_online").setValue("true").setSelected(this.settings.bufferOnline === "true"))
      .setWrapText(true));
      
    bufferSection.addWidget(this._createLabel("Default Online Buffer (Mins)", ""));
    bufferSection.addWidget(CardService.newTextInput().setFieldName("setting_online_buffer").setValue(this.settings.onlineBuffer || "15"));
    bufferSection.addWidget(CardService.newTextParagraph().setText("<i>If 'Apply buffer to online meetings?' is turned on and this field is left blank, Headstart will use a default 15 minute buffer.</i>"));
    bufferSection.addWidget(this._createLabel("Buffered Event Reminder (Mins Before Buffer Starts)", ""));
    bufferSection.addWidget(CardService.newTextInput().setFieldName("setting_buffer_reminder_minutes").setValue(this.settings.bufferReminderMinutes !== undefined ? this.settings.bufferReminderMinutes : "0"));
    bufferSection.addWidget(CardService.newTextParagraph().setText("<i>Use 0 for a reminder at buffer start, 5 for five minutes before, or leave this blank to disable Headstart reminders on the buffered event.</i>"));
    
    const locationSection = CardService.newCardSection().setHeader("Location & Transport").setCollapsible(true).setNumUncollapsibleWidgets(4);
    
    locationSection.addWidget(this._createLabel("Home Address", ""));
    locationSection.addWidget(CardService.newTextInput().setFieldName("setting_home").setValue(this.settings.homeAddress || ""));
    
    locationSection.addWidget(this._createLabel("Global Extra Safety Buffer (Mins)", ""));
    locationSection.addWidget(CardService.newTextInput().setFieldName("setting_extra").setValue(this.settings.extraBuffer || ""));
    
    locationSection.addWidget(this._createLabel("University Name", "e.g. University of Sheffield"));
    locationSection.addWidget(CardService.newTextInput().setFieldName("setting_uni_name").setValue(this.settings.uniName || ""));

    locationSection.addWidget(this._createLabel("I'm willing to walk up to:", ""));
    const walkDropdown = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName("setting_walk_limit");
    walkDropdown.addItem("1.0 km (approx 12 mins)", "1.0", this.settings.walkLimit === "1.0");
    walkDropdown.addItem("1.5 km (approx 18 mins)", "1.5", this.settings.walkLimit === "1.5");
    walkDropdown.addItem("2.0 km (approx 25 mins)", "2.0", this.settings.walkLimit === "2.0");
    walkDropdown.addItem("3.0 km (approx 35 mins)", "3.0", this.settings.walkLimit === "3.0");
    walkDropdown.addItem("5.0 km (approx 45-60 mins)", "5.0", this.settings.walkLimit === "5.0");
    locationSection.addWidget(walkDropdown);

    locationSection.addWidget(this._createLabel("For trips longer than that:", ""));
    const transportDropdown = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName("setting_transport");
    transportDropdown.addItem("Driving (Car)", "DRIVING", this.settings.transportMode === "DRIVING");
    transportDropdown.addItem("Public Transit (Bus/Train)", "TRANSIT", this.settings.transportMode === "TRANSIT");
    locationSection.addWidget(transportDropdown);
    
    const calSection = CardService.newCardSection().setHeader("Calendar Integration").setCollapsible(true).setNumUncollapsibleWidgets(2);
    
    calSection.addWidget(this._createLabel("Headstart Calendar Color", ""));
    const colorDropdown = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName("setting_cal_color");
    colorDropdown.addItem("Orange (Default)", CalendarApp.Color.ORANGE, this.settings.calColor == CalendarApp.Color.ORANGE);
    colorDropdown.addItem("Blue", CalendarApp.Color.BLUE, this.settings.calColor == CalendarApp.Color.BLUE);
    colorDropdown.addItem("Green", CalendarApp.Color.GREEN, this.settings.calColor == CalendarApp.Color.GREEN);
    colorDropdown.addItem("Red", CalendarApp.Color.RED, this.settings.calColor == CalendarApp.Color.RED);
    colorDropdown.addItem("Purple", CalendarApp.Color.PURPLE, this.settings.calColor == CalendarApp.Color.PURPLE);
    calSection.addWidget(colorDropdown);
    
    calSection.addWidget(this._createLabel("University Calendar", ""));
    const uniCalDropdown = CardService.newSelectionInput().setType(CardService.SelectionInputType.DROPDOWN).setFieldName("setting_uni_cal");
    uniCalDropdown.addItem("None", "", (this.settings.uniCalId === "")); 
    
    const calendars = CalendarApp.getAllCalendars();
    for (let i = 0; i < calendars.length; i++) {
      const cal = calendars[i];
      uniCalDropdown.addItem(cal.getName(), cal.getId(), (cal.getId() === this.settings.uniCalId));
    }
    calSection.addWidget(uniCalDropdown);

    builder.addSection(bufferSection);
    builder.addSection(locationSection);
    builder.addSection(calSection);
    builder.setFixedFooter(this._createFixedFooter(
      this._createActionButton("Save Settings", "handleSaveSettings", {
        style: CardService.TextButtonStyle.FILLED,
        backgroundColor: CONFIG.GOOGLE_BLUE
      })
    ));
    return builder.build();
  }

  createOnboardingCard(isRevisit) {
    const builder = CardService.newCardBuilder();
    const heroSection = CardService.newCardSection();
    heroSection.addWidget(CardService.newImage().setImageUrl("https://raw.githubusercontent.com/oyefola/dissertation-doc/refs/heads/main/images/Untitled%20(4).png"));
    
    heroSection.addWidget(this._createLabel(isRevisit ? "Headstart Tutorial" : "Welcome to Headstart!"));

    const guideSection = CardService.newCardSection().setHeader("How it works").setCollapsible(true).setNumUncollapsibleWidgets(2);
    
    guideSection.addWidget(CardService.newTextParagraph().setText("<b>⚙️ Step 1: Configuration</b><br>Go to Settings to set your Home Address, choose how far you're willing to walk, and pick the transport method Headstart should use for longer trips."));
    guideSection.addWidget(CardService.newTextParagraph().setText("<b>⏱️ Step 2: Syncing</b><br>Select your calendars on the Dashboard. Headstart automatically buffers your travel time."));
    guideSection.addWidget(CardService.newTextParagraph().setText("<b>📅 Step 3: Single Events</b><br>Click any event and hit 'Create Buffer' to generate one instantly."));
    guideSection.addWidget(CardService.newTextParagraph().setText("<b>🔕 Step 4: Avoid Double Alerts</b><br>Hide your buffered subscribed calendars or mute the original individual events so you only get alerts for your actual Headstart travel time!"));

    builder.addSection(heroSection);
    builder.addSection(guideSection);
    builder.setFixedFooter(this._createFixedFooter(
      isRevisit
        ? this._createActionButton("Back to Dashboard", "onHomepage", {
            style: CardService.TextButtonStyle.FILLED_TONAL
          })
        : this._createActionButton("Get Started", "handleFinishOnboarding", {
            style: CardService.TextButtonStyle.FILLED,
            backgroundColor: CONFIG.GOOGLE_BLUE
          })
    ));
    return builder.build();
  }

  createBatchSuccessCard(stats) {
    const builder = CardService.newCardBuilder();
    const section = CardService.newCardSection();
    
    section.addWidget(this._createLabel("✅ Sync Complete", "Headstart will now run daily for these calendars."));
    
    section.addWidget(this._createLabel("⏱️ Events Processed", stats.processed.toString()));
    section.addWidget(this._createLabel("🔖 Skipped", stats.skipped.toString()));
    
    if (stats.errors > 0) {
      section.addWidget(this._createLabel("⚠️ Errors Occurred", stats.errors + " events failed to sync."));
    }

    builder.addSection(section);
    builder.setFixedFooter(this._createFixedFooter(
      this._createActionButton("Back to Dashboard", "onHomepage", {
        style: CardService.TextButtonStyle.FILLED_TONAL
      })
    ));
    return builder.build();
  }

  createShadowInfoCard(event) {
    const builder = CardService.newCardBuilder();
    builder.setDisplayStyle(CardService.DisplayStyle.REPLACE);
    const section = CardService.newCardSection();
    section.addWidget(this._createLabel("⏱️ Shadow Event", "This event is buffering your travel time. View the original event for details."));
    builder.addSection(section);
    return builder.build();
  }

  createUnsavedEventCard() {
    const builder = CardService.newCardBuilder();
    builder.setDisplayStyle(CardService.DisplayStyle.REPLACE);
    const section = CardService.newCardSection();
    section.addWidget(this._createLabel("⚠️ Event Not Saved", "Please save the event before using Headstart."));
    builder.addSection(section);
    return builder.build();
  }

  createPastEventCard() {
    const builder = CardService.newCardBuilder();
    builder.setDisplayStyle(CardService.DisplayStyle.REPLACE);
    const section = CardService.newCardSection();
    section.addWidget(this._createLabel("⏳ Past Event", "Headstart does not calculate travel buffers for events that have already started/passed."));
    builder.addSection(section);
    return builder.build();
  }

  createAllDayEventCard() {
    const builder = CardService.newCardBuilder();
    builder.setDisplayStyle(CardService.DisplayStyle.REPLACE);
    const section = CardService.newCardSection();
    section.addWidget(this._createLabel("🗓️ All-Day Event", "Headstart does not create buffers for all-day events."));
    builder.addSection(section);
    return builder.build();
  }

  createUnreadableEventCard() {
    const builder = CardService.newCardBuilder();
    builder.setDisplayStyle(CardService.DisplayStyle.REPLACE);
    const section = CardService.newCardSection();
    section.addWidget(this._createLabel("⚠️ Event Unavailable", "Headstart couldn't read this event from Calendar, so no buffer was created."));
    builder.addSection(section);
    return builder.build();
  }
}
