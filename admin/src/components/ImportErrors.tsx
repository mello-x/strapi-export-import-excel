import { Box, Typography } from "@strapi/design-system";

const ImportErrors = ({ errors }: { errors: string[] }) =>
  errors.length === 0 ? null : (
    <Box style={{ marginTop: "16px", maxHeight: "240px", overflowY: "auto" }} role="log" aria-label="Import errors">
      <Typography variant="sigma" textColor="danger600">
        {errors.length} error{errors.length === 1 ? "" : "s"}
      </Typography>
      <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
        {errors.map((error, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list, messages can repeat
          <li key={i}>
            <Typography variant="pi" textColor="neutral700">
              {error}
            </Typography>
          </li>
        ))}
      </ul>
    </Box>
  );

export { ImportErrors };
