/**
 * Named group of monitors — header + card body with rows.
 */
import type { FC } from "react";
import type { PulseGroup as PulseGroupType } from "../../types/pulse.ts";
import { FormRowSeparator, FormSection, FormSectionCard } from "../ui/form-section.tsx";
import { MonitorRow } from "./monitor-row.tsx";

interface MonitorGroupProps {
	group: PulseGroupType;
}

export const MonitorGroup: FC<MonitorGroupProps> = ({ group }) => {
	return (
		<FormSection title={group.name}>
			<FormSectionCard>
				{group.monitors.map((m, i) => (
					<div key={m.id}>
						{i > 0 && <FormRowSeparator />}
						<MonitorRow monitor={m} />
					</div>
				))}
			</FormSectionCard>
		</FormSection>
	);
};
