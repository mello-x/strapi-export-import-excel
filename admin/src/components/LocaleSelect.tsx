import { Box, SingleSelect, SingleSelectOption, Typography } from "@strapi/design-system";

export interface Locale {
  code: string;
  name: string;
  isDefault: boolean;
}

interface LocaleSelectProps {
  locales: Locale[];
  value: string;
  onChange: (val: string) => void;
}

const LocaleSelect = ({ locales, value, onChange }: LocaleSelectProps) => (
  <Box style={{ marginTop: "16px" }}>
    <Typography variant="omega" style={{ display: "block", marginBottom: "6px" }}>
      Locale
    </Typography>
    <SingleSelect
      value={value}
      onChange={(val: string | number) => onChange(String(val))}
      placeholder="Select locale..."
    >
      {locales.map((locale) => (
        <SingleSelectOption key={locale.code} value={locale.code}>
          {locale.name} {locale.isDefault ? "(default)" : ""}
        </SingleSelectOption>
      ))}
    </SingleSelect>
  </Box>
);

export { LocaleSelect };
