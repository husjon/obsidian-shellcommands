/*
 * 'Shell commands' plugin for Obsidian.
 * Copyright (C) 2021 - 2022 Jarkko Linnanvirta
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.0 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * Contact the author (Jarkko Linnanvirta): https://github.com/Taitava/
 */

import SC_Plugin from "../../main";
import {
    GlobalVariableDefaultValueConfiguration,
    InheritableVariableDefaultValueConfiguration,
    Variable,
    VariableDefaultValueType,
    VariableDefaultValueTypeWithInherit,
} from "../../variables/Variable";
import {
    Setting,
    TextAreaComponent,
} from "obsidian";
import {createAutocomplete} from "./Autocomplete";
import {TShellCommand} from "../../TShellCommand";
import {CustomVariable} from "../../variables/CustomVariable";

export function createVariableDefaultValueFields(plugin: SC_Plugin, containerElement: HTMLElement, targetObject: Variable | TShellCommand) {

    const targetType =
        targetObject instanceof TShellCommand
            ? 'tShellCommand'
            : targetObject instanceof CustomVariable
                ? 'customVariable'
                : 'builtinVariable'
    ;

    // Add default value fields for each variable that can have a default value.
    for (const variable of plugin.getVariables()) {

        // TODO: Extract the logic of creating a single field to a separate function in this file.

        // Only add fields for variables that are not always accessible.
        if (!variable.isAlwaysAvailable()) {

            // Get an identifier for a variable (an id, if it's a CustomVariable, otherwise the variable's name).
            const variableIdentifier = variable.getIdentifier();

            // If a default value has been defined for this variable (and this targetObject), retrieve the configuration.
            let defaultValueConfiguration: GlobalVariableDefaultValueConfiguration | InheritableVariableDefaultValueConfiguration | undefined;
            switch (targetType) {
                case "tShellCommand":
                    defaultValueConfiguration = (targetObject as TShellCommand).getDefaultValueConfigurationForVariable(variable, false);
                    break;
                case "builtinVariable": // Both classes have...
                case "customVariable":  // ... the getGlobalDefaultValueConfiguration() method.
                    defaultValueConfiguration = (targetObject as Variable | CustomVariable).getGlobalDefaultValueConfiguration();
                    break;
            }

            // A function for creating configuration in onChange() callbacks if the variable does not yet have one for this configuration.
            const createDefaultValueConfiguration = () => {
                const configuration: GlobalVariableDefaultValueConfiguration /* This type should be compatible also when assigning the configuration to a TShellCommand, which actually uses InheritableVariableDefaultValueConfiguration instead of Global*. */ = {
                    type: "show-errors",
                    value: "",
                };

                // Store the configuration to the target object's configuration.
                switch (targetType) {
                    case "tShellCommand":
                        (targetObject as TShellCommand).getConfiguration().variable_default_values[variableIdentifier] = configuration;
                        break;
                    case "builtinVariable":
                        plugin.settings.builtin_variables[variableIdentifier].default_value = configuration;
                        break;
                    case "customVariable":
                        (targetObject as CustomVariable).getConfiguration().default_value = configuration;
                        break;
                }
                return configuration;
            }

            let textareaComponent: TextAreaComponent;

            // A function for updating textareaComponent visibility.
            const updateTextareaComponentVisibility = (type: string) => {
                if ("value" === type) {
                    textareaComponent.inputEl.removeClass("SC-hide");
                } else {
                    textareaComponent.inputEl.addClass("SC-hide");
                }
            };

            // Define a set of options for default value type
            const defaultValueTypeOptions = {
                "inherit": "", // Will be updated or deleted below.
                "show-errors": "Cancel execution and show errors",
                "cancel-silently": "Cancel execution silently",
                "value": "Execute with value:",
            };
            switch (targetType) {
                case "tShellCommand": {
                    // Shell commands can have the "inherit" type.
                    const globalDefaultValueConfiguration: GlobalVariableDefaultValueConfiguration | undefined = variable.getGlobalDefaultValueConfiguration();
                    const globalDefaultValueType: VariableDefaultValueType = globalDefaultValueConfiguration ? globalDefaultValueConfiguration.type : "show-errors";
                    defaultValueTypeOptions.inherit = "Inherit: " + defaultValueTypeOptions[globalDefaultValueType];
                    if ("value" === globalDefaultValueType) {
                        defaultValueTypeOptions.inherit += " " + globalDefaultValueConfiguration?.value;
                    }
                    break;
                }
                case "builtinVariable":
                case "customVariable": {
                    // Variables do not have the "inherit" type.
                    // @ts-ignore Don't yell about removing a non-optional property "inherit".
                    delete defaultValueTypeOptions.inherit;
                }
            }

            // Create the default value setting
            new Setting(containerElement)
                .setName(variable.getFullName())
                .setDesc("If not available, then:")
                .setTooltip(variable.getAvailabilityTextPlain())
                .addDropdown(dropdown => dropdown
                    .addOptions(defaultValueTypeOptions)
                    .setValue(defaultValueConfiguration ? defaultValueConfiguration.type : "inherit")
                    .onChange(async (newType: VariableDefaultValueTypeWithInherit) => {
                        if (!defaultValueConfiguration) {
                            defaultValueConfiguration = createDefaultValueConfiguration();
                        }

                        // Set the new type
                        defaultValueConfiguration.type = newType;
                        if (targetType === "tShellCommand") {
                            // Shell commands:
                            if ("inherit" === newType && defaultValueConfiguration.value === "") {
                                // If "inherit" is selected and no text value is typed, the configuration file can be cleaned up by removing this configuration object completely.
                                // Prevent deleting, if a text value is present, because the user might want to keep it if they will later change 'type' to 'value'.
                                delete (targetObject as TShellCommand).getConfiguration().variable_default_values[variableIdentifier];
                            }
                        } else {
                            // Variables:
                            if ("show-errors" === newType && defaultValueConfiguration.value === "") {
                                // If "show-errors" is selected and no text value is typed, the configuration file can be cleaned up by removing this configuration object completely.
                                // Prevent deleting, if a text value is present, because the user might want to keep it if they will later change 'type' to 'value'.
                                switch (targetType) {
                                    case "builtinVariable":
                                        plugin.settings.builtin_variables[variableIdentifier].default_value = undefined;
                                        break;
                                    case "customVariable":
                                        (targetObject as CustomVariable).getConfiguration().default_value = undefined;
                                        break;
                                }
                            }
                        }

                        // Show/hide the textarea
                        updateTextareaComponentVisibility(newType);

                        // Save the settings
                        await plugin.saveSettings();
                    }),
                )
                .addTextArea(textarea => textareaComponent = textarea
                    .setValue(defaultValueConfiguration ? defaultValueConfiguration.value : "")
                    .onChange(async (newValue: string) => {
                        if (!defaultValueConfiguration) {
                            defaultValueConfiguration = createDefaultValueConfiguration();
                        }

                        // Set the new text value
                        defaultValueConfiguration.value = newValue;

                        // Save the settings
                        await plugin.saveSettings();
                    }).then((textareaComponent) => {
                        // Autocomplete for the textarea.
                        if (plugin.settings.show_autocomplete_menu) {
                            createAutocomplete(plugin, textareaComponent.inputEl, () => textareaComponent.onChanged());
                        }
                    }),
                )
            ;
            updateTextareaComponentVisibility(
                defaultValueConfiguration
                        ? defaultValueConfiguration.type
                        : targetType === "tShellCommand"
                            ? "show-errors" // It does not really matter if passing "show-errors" ....
                            : "inherit"     // ... or "inherit", both will have the same effect (= hide a textarea), but this is more future-proof.
            );
        }
    }

}