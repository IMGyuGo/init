import { getCompanyPostingActions } from "./company-posting-actions";

const closedActions = getCompanyPostingActions({ status: "CLOSED" });
const openActions = getCompanyPostingActions({ status: "OPEN" });

type CompanyPostingAction = ReturnType<typeof getCompanyPostingActions>[number];

// @ts-expect-error Closed posting copy is no longer a supported list action.
const removedCopyAction: CompanyPostingAction = "copy";

void closedActions;
void openActions;
void removedCopyAction;
