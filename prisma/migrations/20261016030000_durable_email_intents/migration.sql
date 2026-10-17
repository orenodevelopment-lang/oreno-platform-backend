-- Keep sensitive email render input in PostgreSQL under application-layer
-- encryption. The transactional outbox and BullMQ jobs carry only the delivery
-- UUID, so password-reset, verification, invitation, and newsletter tokens do
-- not enter event or Redis payloads.
ALTER TABLE "email_deliveries"
ADD COLUMN "payload_encrypted" TEXT;
