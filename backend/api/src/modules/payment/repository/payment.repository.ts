import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../shared/prisma.service";
import type {
  CreatePaymentCustomerRepositoryInput,
  CreatePaymentOrderRepositoryInput,
  MarkPaymentOrderDoneInput,
  MarkPaymentOrderFailedInput,
  PaymentCustomerRecord,
  PaymentOrderRecord,
  PaymentOwnerContext,
  PaymentOrderStatus,
  PaymentProvider,
  PaymentRepositoryPort,
} from "../service/payment.service";

@Injectable()
export class PrismaPaymentRepository implements PaymentRepositoryPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findCustomerByOwner(provider: PaymentProvider, owner: PaymentOwnerContext): Promise<PaymentCustomerRecord | null> {
    const customer = await this.prisma.paymentCustomer.findFirst({
      where: {
        provider,
        companyId: owner.companyId === null ? null : BigInt(owner.companyId),
        candidateId: owner.candidateId === null ? null : BigInt(owner.candidateId),
      } as Prisma.PaymentCustomerWhereInput,
    });
    return customer ? mapPaymentCustomer(customer) : null;
  }

  async createCustomer(input: CreatePaymentCustomerRepositoryInput): Promise<PaymentCustomerRecord> {
    const customer = await this.prisma.paymentCustomer.create({
      data: {
        userId: BigInt(input.userId),
        companyId: input.companyId === null ? null : BigInt(input.companyId),
        candidateId: input.candidateId === null ? null : BigInt(input.candidateId),
        provider: input.provider,
        customerKey: input.customerKey,
      } as Prisma.PaymentCustomerUncheckedCreateInput,
    });
    return mapPaymentCustomer(customer);
  }

  async createOrder(input: CreatePaymentOrderRepositoryInput): Promise<PaymentOrderRecord> {
    const order = await this.prisma.paymentOrder.create({
      data: {
        paymentCustomerId: BigInt(input.paymentCustomerId),
        companyId: input.companyId === null ? null : BigInt(input.companyId),
        candidateId: input.candidateId === null ? null : BigInt(input.candidateId),
        provider: input.provider,
        orderId: input.orderId,
        productCode: input.productCode,
        orderName: input.orderName,
        type: input.type,
        status: "READY",
        amount: input.amount,
        currency: input.currency,
      } as Prisma.PaymentOrderUncheckedCreateInput,
    });
    return mapPaymentOrder(order);
  }

  async findOrderByOrderId(provider: PaymentProvider, orderId: string): Promise<PaymentOrderRecord | null> {
    const order = await this.prisma.paymentOrder.findUnique({
      where: {
        provider_orderId: {
          provider,
          orderId,
        },
      },
    });
    return order ? mapPaymentOrder(order) : null;
  }

  async listOrders(owner: PaymentOwnerContext, status?: PaymentOrderStatus): Promise<{ items: PaymentOrderRecord[]; totalItems: number }> {
    const where: Prisma.PaymentOrderWhereInput = {
      companyId: owner.companyId === null ? null : BigInt(owner.companyId),
      candidateId: owner.candidateId === null ? null : BigInt(owner.candidateId),
      ...(status ? { status } : {}),
    } as Prisma.PaymentOrderWhereInput;
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.paymentOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.paymentOrder.count({ where }),
    ]);
    return { items: items.map(mapPaymentOrder), totalItems };
  }

  async markOrderInProgress(orderId: string, paymentKey: string): Promise<PaymentOrderRecord | null> {
    const result = await this.prisma.paymentOrder.updateMany({
      where: {
        provider: "TOSS",
        orderId,
        status: "READY",
      },
      data: {
        status: "IN_PROGRESS",
        paymentKey,
        requestedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const order = await this.prisma.paymentOrder.findUnique({
      where: {
        provider_orderId: {
          provider: "TOSS",
          orderId,
        },
      },
    });
    if (!order) {
      throw new Error("Payment order not found after in-progress update.");
    }
    return mapPaymentOrder(order);
  }

  async markOrderDone(orderId: string, input: MarkPaymentOrderDoneInput): Promise<PaymentOrderRecord> {
    await this.prisma.paymentOrder.updateMany({
      where: {
        provider: "TOSS",
        orderId,
        status: "IN_PROGRESS",
        paymentKey: input.paymentKey,
      },
      data: {
        status: "DONE",
        paymentKey: input.paymentKey,
        method: input.method,
        receiptUrl: input.receiptUrl,
        approvedAt: input.approvedAt,
        providerPayload: input.providerPayload as Prisma.InputJsonValue,
      },
    });

    const order = await this.prisma.paymentOrder.findUnique({
      where: {
        provider_orderId: {
          provider: "TOSS",
          orderId,
        },
      },
    });
    if (!order) {
      throw new Error("Payment order not found after done update.");
    }
    return mapPaymentOrder(order);
  }

  async markOrderFailed(orderId: string, input: MarkPaymentOrderFailedInput): Promise<PaymentOrderRecord> {
    await this.prisma.paymentOrder.updateMany({
      where: {
        provider: "TOSS",
        orderId,
        status: { in: ["READY", "IN_PROGRESS"] },
        ...(input.paymentKey ? { paymentKey: input.paymentKey } : {}),
      },
      data: {
        status: "FAILED",
        failureCode: input.failureCode,
        failureMessage: input.failureMessage,
        failedAt: new Date(),
      },
    });

    const order = await this.prisma.paymentOrder.findUnique({
      where: {
        provider_orderId: {
          provider: "TOSS",
          orderId,
        },
      },
    });
    if (!order) {
      throw new Error("Payment order not found after failure update.");
    }
    return mapPaymentOrder(order);
  }
}

type PrismaPaymentCustomer = Prisma.PaymentCustomerGetPayload<Record<string, never>>;
type PrismaPaymentOrder = Prisma.PaymentOrderGetPayload<Record<string, never>>;

function mapPaymentCustomer(customer: PrismaPaymentCustomer): PaymentCustomerRecord {
  const ownerFields = customer as PrismaPaymentCustomer & { candidateId?: bigint | null };
  return {
    paymentCustomerId: Number(customer.paymentCustomerId),
    userId: Number(customer.userId),
    companyId: customer.companyId === null ? null : Number(customer.companyId),
    candidateId: ownerFields.candidateId === null || ownerFields.candidateId === undefined ? null : Number(ownerFields.candidateId),
    provider: customer.provider as PaymentProvider,
    customerKey: customer.customerKey,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

function mapPaymentOrder(order: PrismaPaymentOrder): PaymentOrderRecord {
  const ownerFields = order as PrismaPaymentOrder & { candidateId?: bigint | null };
  return {
    paymentOrderId: Number(order.paymentOrderId),
    paymentCustomerId: Number(order.paymentCustomerId),
    companyId: order.companyId === null ? null : Number(order.companyId),
    candidateId: ownerFields.candidateId === null || ownerFields.candidateId === undefined ? null : Number(ownerFields.candidateId),
    provider: order.provider as PaymentProvider,
    orderId: order.orderId,
    paymentKey: order.paymentKey,
    productCode: order.productCode as PaymentOrderRecord["productCode"],
    orderName: order.orderName,
    type: order.type as PaymentOrderRecord["type"],
    status: order.status as PaymentOrderRecord["status"],
    amount: order.amount,
    currency: order.currency as "KRW",
    method: order.method,
    receiptUrl: order.receiptUrl,
    failureCode: order.failureCode,
    failureMessage: order.failureMessage,
    providerPayload: order.providerPayload,
    requestedAt: order.requestedAt,
    approvedAt: order.approvedAt,
    failedAt: order.failedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
