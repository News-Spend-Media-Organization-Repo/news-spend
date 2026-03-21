import { useMutation } from "@tanstack/react-query";

import { orpc } from "#/lib/orpc";

const useCreateReport = () => {
  return useMutation(orpc.report.create.mutationOptions({}));
};
export default useCreateReport;
