CREATE TABLE "adapter_registry" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"sscc" text PRIMARY KEY NOT NULL,
	"drawn_on" date NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"audited_on" date,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "blocks_view" (
	"channel" text NOT NULL,
	"number" bigint NOT NULL,
	"data_hash" text NOT NULL,
	"previous_hash" text NOT NULL,
	"block_hash" text NOT NULL,
	"tx_count" integer NOT NULL,
	"time" timestamp with time zone NOT NULL,
	CONSTRAINT "blocks_view_channel_number_pk" PRIMARY KEY("channel","number")
);
--> statement-breakpoint
CREATE TABLE "deposits_view" (
	"deposit_id" text PRIMARY KEY NOT NULL,
	"sscc" text NOT NULL,
	"deposit" jsonb NOT NULL,
	"proof" jsonb
);
--> statement-breakpoint
CREATE TABLE "device_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"sscc" text NOT NULL,
	"reading" jsonb NOT NULL,
	"signature_hex" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diary_inputs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"farmer_id" uuid NOT NULL,
	"plot_id" text,
	"crop" text NOT NULL,
	"product" text NOT NULL,
	"active_ingredient" text NOT NULL,
	"dose" text NOT NULL,
	"applied_on" date NOT NULL,
	"phi_days" integer NOT NULL,
	"phi_clear_on" date NOT NULL,
	"hash" text NOT NULL,
	"tx_id" text,
	"block_number" bigint
);
--> statement-breakpoint
CREATE TABLE "farmers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"name_local" text DEFAULT '' NOT NULL,
	"gender" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"village" text NOT NULL,
	"preferred_lang" text DEFAULT 'bn' NOT NULL,
	"device_public_key_hex" text DEFAULT '' NOT NULL,
	"consent" jsonb,
	"joined_on" date NOT NULL,
	"erased" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farmers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "indexer_checkpoints" (
	"channel" text PRIMARY KEY NOT NULL,
	"next_block" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"block_number" bigint NOT NULL,
	"tx_id" text NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"event" text NOT NULL,
	"sscc" text,
	"order_id" text,
	"enwr" text,
	"at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liens_view" (
	"enwr" text PRIMARY KEY NOT NULL,
	"sscc" text NOT NULL,
	"loan_id" text NOT NULL,
	"active" boolean NOT NULL,
	"lien" jsonb NOT NULL,
	"loan" jsonb NOT NULL,
	"proofs" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_terms" (
	"loan_id" text PRIMARY KEY NOT NULL,
	"enwr" text NOT NULL,
	"sscc" text NOT NULL,
	"amount" bigint NOT NULL,
	"tenure_days" integer NOT NULL,
	"rate_pct" double precision NOT NULL,
	"salt" text NOT NULL,
	"repaid_amount" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_drafts" (
	"sscc" text PRIMARY KEY NOT NULL,
	"human_ref" text NOT NULL,
	"farmer_id" uuid NOT NULL,
	"plot_id" text NOT NULL,
	"commodity" text NOT NULL,
	"variety" text,
	"village" text NOT NULL,
	"bag_count" integer NOT NULL,
	"est_weight_kg" integer NOT NULL,
	"harvest_or_unload_date" date NOT NULL,
	"payload_to_sign" text NOT NULL,
	"created_by" text NOT NULL,
	"status" text DEFAULT 'PENDING_FARMER_SIGNATURE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lot_drafts_human_ref_unique" UNIQUE("human_ref")
);
--> statement-breakpoint
CREATE TABLE "lots_view" (
	"sscc" text PRIMARY KEY NOT NULL,
	"human_ref" text NOT NULL,
	"commodity" text NOT NULL,
	"variety" text DEFAULT '' NOT NULL,
	"village" text NOT NULL,
	"farmer_token" text NOT NULL,
	"plot_id" text NOT NULL,
	"status" text NOT NULL,
	"origin_status" text NOT NULL,
	"grade" text DEFAULT '' NOT NULL,
	"bag_count" integer NOT NULL,
	"est_weight_kg" integer NOT NULL,
	"net_kg" integer DEFAULT 0 NOT NULL,
	"harvest_or_unload_date" text NOT NULL,
	"order_id" text DEFAULT '' NOT NULL,
	"lot" jsonb NOT NULL,
	"proofs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_tx_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mirror_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"sscc" text NOT NULL,
	"args" jsonb NOT NULL,
	"identity" text NOT NULL,
	"endorse_set" text NOT NULL,
	"cause" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"done" boolean DEFAULT false NOT NULL,
	"done_tx_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "msp_entries" (
	"crop" text NOT NULL,
	"season" text NOT NULL,
	"grade" text NOT NULL,
	"price_per_qtl" integer NOT NULL,
	"announced_on" date NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	CONSTRAINT "msp_entries_crop_season_grade_pk" PRIMARY KEY("crop","season","grade")
);
--> statement-breakpoint
CREATE TABLE "orders_view" (
	"order_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"order" jsonb NOT NULL,
	"proofs" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patronage_view" (
	"run_id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"run" jsonb NOT NULL,
	"distributed_at" timestamp with time zone NOT NULL,
	"proof" jsonb
);
--> statement-breakpoint
CREATE TABLE "plots" (
	"plot_id" text PRIMARY KEY NOT NULL,
	"farmer_id" uuid NOT NULL,
	"area_ha" double precision NOT NULL,
	"crops" jsonb NOT NULL,
	"geojson" jsonb,
	"polygon_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_series" (
	"date" date NOT NULL,
	"market" text NOT NULL,
	"commodity" text NOT NULL,
	"variety" text DEFAULT '' NOT NULL,
	"min_price" double precision NOT NULL,
	"max_price" double precision NOT NULL,
	"modal_price" double precision NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_series_date_market_commodity_variety_pk" PRIMARY KEY("date","market","commodity","variety")
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"name" text PRIMARY KEY NOT NULL,
	"value" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetry" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subject" text,
	"detail" jsonb,
	"latency_ms" integer,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_prices" (
	"order_id" text PRIMARY KEY NOT NULL,
	"price_per_qtl" double precision NOT NULL,
	"salt" text NOT NULL,
	"price_hash" text NOT NULL,
	"proposed_by" text,
	"agreed" boolean DEFAULT false NOT NULL,
	"settlement_amount" bigint,
	"upi_ref" text
);
--> statement-breakpoint
CREATE TABLE "tx_view" (
	"tx_id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"block_number" bigint NOT NULL,
	"tx_index" integer NOT NULL,
	"chaincode" text NOT NULL,
	"fn" text NOT NULL,
	"validation_code" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"creator_msp" text NOT NULL,
	"endorsers" jsonb NOT NULL,
	"reads" jsonb NOT NULL,
	"writes" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diary_inputs" ADD CONSTRAINT "diary_inputs_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_drafts" ADD CONSTRAINT "lot_drafts_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "farmers_phone_idx" ON "farmers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "farmers_village_idx" ON "farmers" USING btree ("village");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_events_tx_seq" ON "ledger_events" USING btree ("tx_id","seq");--> statement-breakpoint
CREATE INDEX "ledger_events_sscc_idx" ON "ledger_events" USING btree ("sscc");--> statement-breakpoint
CREATE INDEX "ledger_events_order_idx" ON "ledger_events" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "liens_view_loan_idx" ON "liens_view" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "lots_view_status_idx" ON "lots_view" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lots_view_farmer_idx" ON "lots_view" USING btree ("farmer_token");--> statement-breakpoint
CREATE INDEX "lots_view_order_idx" ON "lots_view" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "mirror_queue_open_idx" ON "mirror_queue" USING btree ("done");--> statement-breakpoint
CREATE INDEX "telemetry_kind_idx" ON "telemetry" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "tx_view_block_idx" ON "tx_view" USING btree ("channel","block_number");