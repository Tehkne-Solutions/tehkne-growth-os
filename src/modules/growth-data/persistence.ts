import { Prisma, prisma } from "@/shared/db/prisma";
import type { MetricImportPlan } from "./import-service";

export type CommitMetricImportResult = {
  batchId: string;
  duplicate: boolean;
  acceptedCount: number;
  rejectedCount: number;
};

export async function commitMetricImport(
  plan: MetricImportPlan,
  options: { fileName?: string; actorUserId?: string; requestId?: string } = {},
): Promise<CommitMetricImportResult> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const workspace = await tx.workspace.findUnique({
          where: { id: plan.workspaceId },
          select: {
            id: true,
            operatorOrganizationId: true,
            clientOrganizationId: true,
          },
        });

        if (!workspace) throw new Error("Workspace not found");

        const batch = await tx.metricImportBatch.create({
          data: {
            workspaceId: plan.workspaceId,
            fingerprint: plan.fingerprint,
            sectorPackId: plan.sectorPackId,
            sectorPackVersion: plan.sectorPackVersion,
            source: "csv",
            ...(options.fileName ? { fileName: options.fileName } : {}),
            status: "PREVIEWED",
            acceptedCount: plan.accepted.length,
            rejectedCount: plan.rejected.length,
          },
          select: { id: true },
        });

        if (plan.accepted.length > 0) {
          await tx.metricObservation.createMany({
            data: plan.accepted.map((observation) => ({
              workspaceId: plan.workspaceId,
              importBatchId: batch.id,
              metricId: observation.metricId,
              periodStart: observation.periodStart,
              periodEnd: observation.periodEnd,
              value: observation.value,
              ...(observation.currency ? { currency: observation.currency } : {}),
              source: observation.source,
              dimensions: observation.dimensions,
            })),
          });
        }

        if (plan.rejected.length > 0) {
          await tx.metricImportRejection.createMany({
            data: plan.rejected.map((rejection) => ({
              batchId: batch.id,
              rowNumber: rejection.row,
              reason: rejection.reason.slice(0, 500),
              raw: rejection.raw,
            })),
          });
        }

        await tx.metricImportBatch.update({
          where: { id: batch.id },
          data: { status: "COMMITTED", committedAt: new Date() },
        });

        await tx.auditEvent.create({
          data: {
            operatorOrganizationId: workspace.operatorOrganizationId,
            clientOrganizationId: workspace.clientOrganizationId,
            workspaceId: workspace.id,
            ...(options.actorUserId ? { actorUserId: options.actorUserId } : {}),
            action: "growth.metric_import.committed",
            resourceType: "MetricImportBatch",
            resourceId: batch.id,
            ...(options.requestId ? { requestId: options.requestId } : {}),
            metadata: {
              fingerprint: plan.fingerprint,
              sectorPackId: plan.sectorPackId,
              sectorPackVersion: plan.sectorPackVersion,
              acceptedCount: plan.accepted.length,
              rejectedCount: plan.rejected.length,
            },
          },
        });

        return {
          batchId: batch.id,
          duplicate: false,
          acceptedCount: plan.accepted.length,
          rejectedCount: plan.rejected.length,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.metricImportBatch.findUnique({
        where: {
          workspaceId_fingerprint: {
            workspaceId: plan.workspaceId,
            fingerprint: plan.fingerprint,
          },
        },
        select: {
          id: true,
          acceptedCount: true,
          rejectedCount: true,
        },
      });

      if (existing) {
        return {
          batchId: existing.id,
          duplicate: true,
          acceptedCount: existing.acceptedCount,
          rejectedCount: existing.rejectedCount,
        };
      }
    }

    throw error;
  }
}
