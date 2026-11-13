--
-- PostgreSQL database dump
--

\restrict RpD2f7VAonJdgJNbZdumxNo8m7tfTpWeMrn5HhDjwemsYWAT8gaBtf00QLVHbqG

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: studio; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA studio;


--
-- Name: protect_invoiced_booking(); Type: FUNCTION; Schema: studio; Owner: -
--

CREATE FUNCTION studio.protect_invoiced_booking() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF (NEW.agreed_amount<>OLD.agreed_amount OR NEW.customer_id<>OLD.customer_id OR NEW.status='cancelled') AND EXISTS(SELECT 1 FROM invoices WHERE booking_id=OLD.id AND status='Issued') THEN
  RAISE EXCEPTION 'Void the active invoice before changing its customer, agreed amount or cancelling its booking' USING ERRCODE='P0001';
 END IF;RETURN NEW;
END;$$;


--
-- Name: protect_maintenance_expense(); Type: FUNCTION; Schema: studio; Owner: -
--

CREATE FUNCTION studio.protect_maintenance_expense() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM equipment_maintenance WHERE expense_id=OLD.id) THEN
  RAISE EXCEPTION 'This expense is linked to equipment maintenance and cannot be edited or deleted' USING ERRCODE='P0001';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END;$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: albums; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.albums (
    id integer NOT NULL,
    booking_id integer NOT NULL,
    album_type text NOT NULL,
    size text NOT NULL,
    pages integer NOT NULL,
    printing_cost numeric(12,2) DEFAULT 0 NOT NULL,
    expected_delivery date,
    actual_delivery date,
    status text DEFAULT 'Pending'::text NOT NULL,
    acknowledgement text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT albums_check CHECK (((status <> 'Delivered'::text) OR ((actual_delivery IS NOT NULL) AND (length(TRIM(BOTH FROM acknowledgement)) > 0)))),
    CONSTRAINT albums_pages_check CHECK ((pages > 0)),
    CONSTRAINT albums_printing_cost_check CHECK ((printing_cost >= (0)::numeric)),
    CONSTRAINT albums_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Photo Selection'::text, 'Editing'::text, 'Design'::text, 'Customer Approval'::text, 'Printing'::text, 'Ready for Delivery'::text, 'Delivered'::text])))
);


--
-- Name: albums_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.albums_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: albums_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.albums_id_seq OWNED BY studio.albums.id;


--
-- Name: audit_logs; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.audit_logs (
    id bigint NOT NULL,
    user_id integer,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.audit_logs_id_seq OWNED BY studio.audit_logs.id;


--
-- Name: booking_staff; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.booking_staff (
    booking_id integer NOT NULL,
    staff_id integer NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.bookings (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    event_type_id integer NOT NULL,
    package_id integer,
    event_date date NOT NULL,
    location text NOT NULL,
    agreed_amount numeric(12,2) NOT NULL,
    notes text,
    status text DEFAULT 'confirmed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bookings_agreed_amount_check CHECK ((agreed_amount >= (0)::numeric)),
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'in progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: bookings_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.bookings_id_seq OWNED BY studio.bookings.id;


--
-- Name: customers; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.customers (
    id integer NOT NULL,
    customer_code text GENERATED ALWAYS AS (('CUS-'::text || lpad((id)::text, 5, '0'::text))) STORED,
    name text NOT NULL,
    mobile text NOT NULL,
    alternate_mobile text,
    email text,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.customers_id_seq OWNED BY studio.customers.id;


--
-- Name: equipment; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.equipment (
    id integer NOT NULL,
    asset_code text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    brand text,
    model text,
    serial_number text,
    purchase_date date,
    purchase_cost numeric(12,2) DEFAULT 0 NOT NULL,
    condition text NOT NULL,
    status text DEFAULT 'Available'::text NOT NULL,
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT equipment_category_check CHECK ((category = ANY (ARRAY['Cameras'::text, 'Lenses'::text, 'Lighting'::text, 'Tripods'::text, 'Audio'::text, 'Accessories'::text, 'Other'::text]))),
    CONSTRAINT equipment_purchase_cost_check CHECK ((purchase_cost >= (0)::numeric)),
    CONSTRAINT equipment_status_check CHECK ((status = ANY (ARRAY['Available'::text, 'Maintenance'::text, 'Retired'::text])))
);


--
-- Name: equipment_assignments; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.equipment_assignments (
    id bigint NOT NULL,
    equipment_id integer NOT NULL,
    booking_id integer NOT NULL,
    assigned_by integer NOT NULL,
    assigned_date date NOT NULL,
    expected_return_date date NOT NULL,
    actual_return_date date,
    status text DEFAULT 'Active'::text NOT NULL,
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT equipment_assignments_check CHECK ((expected_return_date >= assigned_date)),
    CONSTRAINT equipment_assignments_check1 CHECK ((((status = 'Active'::text) AND (actual_return_date IS NULL)) OR ((status = 'Returned'::text) AND (actual_return_date >= assigned_date)))),
    CONSTRAINT equipment_assignments_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Returned'::text])))
);


--
-- Name: equipment_assignments_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.equipment_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipment_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.equipment_assignments_id_seq OWNED BY studio.equipment_assignments.id;


--
-- Name: equipment_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.equipment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipment_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.equipment_id_seq OWNED BY studio.equipment.id;


--
-- Name: equipment_maintenance; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.equipment_maintenance (
    id bigint NOT NULL,
    equipment_id integer NOT NULL,
    maintenance_type text NOT NULL,
    service_date date NOT NULL,
    description text NOT NULL,
    service_provider text,
    maintenance_cost numeric(12,2) DEFAULT 0 NOT NULL,
    next_service_date date,
    status text NOT NULL,
    expense_id integer,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT equipment_maintenance_check CHECK (((next_service_date IS NULL) OR (next_service_date >= service_date))),
    CONSTRAINT equipment_maintenance_maintenance_cost_check CHECK ((maintenance_cost >= (0)::numeric)),
    CONSTRAINT equipment_maintenance_status_check CHECK ((status = ANY (ARRAY['In progress'::text, 'Completed'::text])))
);


--
-- Name: equipment_maintenance_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.equipment_maintenance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipment_maintenance_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.equipment_maintenance_id_seq OWNED BY studio.equipment_maintenance.id;


--
-- Name: event_types; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.event_types (
    id integer NOT NULL,
    name text NOT NULL
);


--
-- Name: event_types_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.event_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: event_types_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.event_types_id_seq OWNED BY studio.event_types.id;


--
-- Name: expenses; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.expenses (
    id integer NOT NULL,
    date date NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    amount numeric(12,2) NOT NULL,
    method text NOT NULL,
    booking_id integer,
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT expenses_category_check CHECK ((category = ANY (ARRAY['Salaries'::text, 'Equipment'::text, 'Printing'::text, 'Travel'::text, 'Other'::text]))),
    CONSTRAINT expenses_method_check CHECK ((method = ANY (ARRAY['Cash'::text, 'UPI'::text, 'Bank transfer'::text, 'Cheque'::text])))
);


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.expenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.expenses_id_seq OWNED BY studio.expenses.id;


--
-- Name: invoice_items; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.invoice_items (
    id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    description text NOT NULL,
    quantity numeric(12,3) NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    line_total numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_items_check CHECK ((line_total = round((quantity * unit_price), 2))),
    CONSTRAINT invoice_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT invoice_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.invoice_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_items_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.invoice_items_id_seq OWNED BY studio.invoice_items.id;


--
-- Name: invoices; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.invoices (
    id bigint NOT NULL,
    invoice_number text GENERATED ALWAYS AS (('INV-'::text || lpad((id)::text, 8, '0'::text))) STORED NOT NULL,
    booking_id integer NOT NULL,
    customer_id integer NOT NULL,
    invoice_date date NOT NULL,
    due_date date NOT NULL,
    studio_snapshot jsonb NOT NULL,
    customer_snapshot jsonb NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    status text DEFAULT 'Issued'::text NOT NULL,
    terms text DEFAULT ''::text NOT NULL,
    idempotency_key uuid NOT NULL,
    request_hash text NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    void_reason text,
    voided_by integer,
    voided_at timestamp with time zone,
    CONSTRAINT invoices_check CHECK ((due_date >= invoice_date)),
    CONSTRAINT invoices_check1 CHECK (((total_amount >= (0)::numeric) AND (total_amount = ((subtotal - discount) + tax_amount)))),
    CONSTRAINT invoices_check2 CHECK (((status <> 'Void'::text) OR ((length(TRIM(BOTH FROM void_reason)) > 0) AND (voided_by IS NOT NULL) AND (voided_at IS NOT NULL)))),
    CONSTRAINT invoices_discount_check CHECK ((discount >= (0)::numeric)),
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['Issued'::text, 'Void'::text]))),
    CONSTRAINT invoices_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT invoices_tax_amount_check CHECK ((tax_amount = (0)::numeric))
);


--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.invoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.invoices_id_seq OWNED BY studio.invoices.id;


--
-- Name: packages; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.packages (
    id integer NOT NULL,
    name text NOT NULL,
    amount numeric(12,2) NOT NULL,
    description text,
    CONSTRAINT packages_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: packages_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.packages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: packages_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.packages_id_seq OWNED BY studio.packages.id;


--
-- Name: payments; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.payments (
    id integer NOT NULL,
    booking_id integer NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric(12,2) NOT NULL,
    method text NOT NULL,
    reference text,
    remarks text,
    idempotency_key uuid NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payments_method_check CHECK ((method = ANY (ARRAY['Cash'::text, 'UPI'::text, 'Bank transfer'::text, 'Cheque'::text])))
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.payments_id_seq OWNED BY studio.payments.id;


--
-- Name: roles; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.roles (
    id integer NOT NULL,
    name text NOT NULL,
    CONSTRAINT roles_name_check CHECK ((name = ANY (ARRAY['admin'::text, 'staff'::text])))
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.roles_id_seq OWNED BY studio.roles.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.schema_migrations (
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.staff (
    id integer NOT NULL,
    user_id integer,
    name text NOT NULL,
    mobile text,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: staff_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.staff_id_seq OWNED BY studio.staff.id;


--
-- Name: studio_settings; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.studio_settings (
    id integer DEFAULT 1 NOT NULL,
    name text DEFAULT 'The Photo Studio'::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    address text DEFAULT ''::text NOT NULL,
    CONSTRAINT studio_settings_id_check CHECK ((id = 1))
);


--
-- Name: users; Type: TABLE; Schema: studio; Owner: -
--

CREATE TABLE studio.users (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role_id integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    password_version integer DEFAULT 0 NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: studio; Owner: -
--

CREATE SEQUENCE studio.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: studio; Owner: -
--

ALTER SEQUENCE studio.users_id_seq OWNED BY studio.users.id;


--
-- Name: albums id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.albums ALTER COLUMN id SET DEFAULT nextval('studio.albums_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.audit_logs ALTER COLUMN id SET DEFAULT nextval('studio.audit_logs_id_seq'::regclass);


--
-- Name: bookings id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.bookings ALTER COLUMN id SET DEFAULT nextval('studio.bookings_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.customers ALTER COLUMN id SET DEFAULT nextval('studio.customers_id_seq'::regclass);


--
-- Name: equipment id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment ALTER COLUMN id SET DEFAULT nextval('studio.equipment_id_seq'::regclass);


--
-- Name: equipment_assignments id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment_assignments ALTER COLUMN id SET DEFAULT nextval('studio.equipment_assignments_id_seq'::regclass);


--
-- Name: equipment_maintenance id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment_maintenance ALTER COLUMN id SET DEFAULT nextval('studio.equipment_maintenance_id_seq'::regclass);


--
-- Name: event_types id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.event_types ALTER COLUMN id SET DEFAULT nextval('studio.event_types_id_seq'::regclass);


--
-- Name: expenses id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.expenses ALTER COLUMN id SET DEFAULT nextval('studio.expenses_id_seq'::regclass);


--
-- Name: invoice_items id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.invoice_items ALTER COLUMN id SET DEFAULT nextval('studio.invoice_items_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.invoices ALTER COLUMN id SET DEFAULT nextval('studio.invoices_id_seq'::regclass);


--
-- Name: packages id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.packages ALTER COLUMN id SET DEFAULT nextval('studio.packages_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.payments ALTER COLUMN id SET DEFAULT nextval('studio.payments_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.roles ALTER COLUMN id SET DEFAULT nextval('studio.roles_id_seq'::regclass);


--
-- Name: staff id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.staff ALTER COLUMN id SET DEFAULT nextval('studio.staff_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.users ALTER COLUMN id SET DEFAULT nextval('studio.users_id_seq'::regclass);


--
-- Data for Name: albums; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.albums (id, booking_id, album_type, size, pages, printing_cost, expected_delivery, actual_delivery, status, acknowledgement, notes, created_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.audit_logs (id, user_id, action, entity, entity_id, created_at) FROM stdin;
1	1	create	customers	1	2026-11-13 12:31:19.594809+05:30
2	1	create	packages	1	2026-11-13 12:33:28.465368+05:30
3	3	change_password	users	3	2026-11-13 12:55:11.996927+05:30
4	3	create	bookings	1	2026-11-13 12:59:39.389861+05:30
5	1	create	payments	1	2026-11-13 13:00:36.237054+05:30
6	1	create	staff	1	2026-11-13 13:01:55.710804+05:30
\.


--
-- Data for Name: booking_staff; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.booking_staff (booking_id, staff_id) FROM stdin;
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.bookings (id, customer_id, event_type_id, package_id, event_date, location, agreed_amount, notes, status, created_at, updated_at) FROM stdin;
1	1	1	1	2026-11-14	Ameerpet	100000.00	\N	confirmed	2026-11-13 12:59:39.389861+05:30	2026-11-13 12:59:39.389861+05:30
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.customers (id, name, mobile, alternate_mobile, email, address, created_at) FROM stdin;
1	Prasad Cherukuri	9676787972	\N	iamprasadcherukuri@gmail.com	srnagar	2026-11-13 12:31:19.594809+05:30
\.


--
-- Data for Name: equipment; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.equipment (id, asset_code, name, category, brand, model, serial_number, purchase_date, purchase_cost, condition, status, remarks, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: equipment_assignments; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.equipment_assignments (id, equipment_id, booking_id, assigned_by, assigned_date, expected_return_date, actual_return_date, status, remarks, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: equipment_maintenance; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.equipment_maintenance (id, equipment_id, maintenance_type, service_date, description, service_provider, maintenance_cost, next_service_date, status, expense_id, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: event_types; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.event_types (id, name) FROM stdin;
1	Wedding
2	Engagement
3	Birthday
4	Pre-wedding
5	Other
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.expenses (id, date, category, description, amount, method, booking_id, remarks, created_at) FROM stdin;
\.


--
-- Data for Name: invoice_items; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.invoice_items (id, invoice_id, description, quantity, unit_price, line_total, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.invoices (id, booking_id, customer_id, invoice_date, due_date, studio_snapshot, customer_snapshot, subtotal, discount, tax_amount, total_amount, status, terms, idempotency_key, request_hash, created_by, created_at, updated_at, void_reason, voided_by, voided_at) FROM stdin;
\.


--
-- Data for Name: packages; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.packages (id, name, amount, description) FROM stdin;
1	Wedding	100000.00	\N
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.payments (id, booking_id, date, amount, method, reference, remarks, idempotency_key, created_by, created_at) FROM stdin;
1	1	2026-11-13	50000.00	Cash	\N	\N	ee07ea5e-f106-458d-9027-c9bc14ddcbe6	1	2026-11-13 13:00:36.237054+05:30
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.roles (id, name) FROM stdin;
1	admin
2	staff
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.schema_migrations (version, applied_at) FROM stdin;
001_invoices_equipment	2026-11-13 12:50:02.290247+05:30
\.


--
-- Data for Name: staff; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.staff (id, user_id, name, mobile, active) FROM stdin;
1	\N	santhosh Vasam	96767879733	t
\.


--
-- Data for Name: studio_settings; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.studio_settings (id, name, phone, email, address) FROM stdin;
1	SARANYA EVENTS AND PHOTOGRAPHY	9666756538	iamprasadcherukuri@gmail.com	Andhra Pradesh and Telangana ,+91 9666756538
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: studio; Owner: -
--

COPY studio.users (id, name, email, password_hash, role_id, active, created_at, must_change_password, password_version) FROM stdin;
1	Admin	iamprasadcherukuri@gmail.com	$2b$12$PMtan6W9DNswTEHDAwXJYuxvbdMdZn3LCMphM19W3Fh9/WenYzi5m	1	t	2026-11-13 12:23:15.949112+05:30	f	0
3	Prasad Cherukuri	aaa@gmail.com	$2b$12$4vBtZ502kM.iA.CK2SjEbu7sCoLEkG7AP5P4GLQhM3lInCg35/oXe	2	t	2026-11-13 12:54:11.019405+05:30	f	1
\.


--
-- Name: albums_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.albums_id_seq', 1, false);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.audit_logs_id_seq', 6, true);


--
-- Name: bookings_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.bookings_id_seq', 1, true);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.customers_id_seq', 1, true);


--
-- Name: equipment_assignments_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.equipment_assignments_id_seq', 1, false);


--
-- Name: equipment_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.equipment_id_seq', 1, false);


--
-- Name: equipment_maintenance_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.equipment_maintenance_id_seq', 1, false);


--
-- Name: event_types_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.event_types_id_seq', 10, true);


--
-- Name: expenses_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.expenses_id_seq', 1, false);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.invoice_items_id_seq', 1, false);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.invoices_id_seq', 1, false);


--
-- Name: packages_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.packages_id_seq', 1, true);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.payments_id_seq', 1, true);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.roles_id_seq', 4, true);


--
-- Name: staff_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.staff_id_seq', 1, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: studio; Owner: -
--

SELECT pg_catalog.setval('studio.users_id_seq', 3, true);


--
-- Name: albums albums_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.albums
    ADD CONSTRAINT albums_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: booking_staff booking_staff_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.booking_staff
    ADD CONSTRAINT booking_staff_pkey PRIMARY KEY (booking_id, staff_id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: customers customers_customer_code_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.customers
    ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: equipment equipment_asset_code_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment
    ADD CONSTRAINT equipment_asset_code_key UNIQUE (asset_code);


--
-- Name: equipment_assignments equipment_assignments_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment_assignments
    ADD CONSTRAINT equipment_assignments_pkey PRIMARY KEY (id);


--
-- Name: equipment_maintenance equipment_maintenance_expense_id_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment_maintenance
    ADD CONSTRAINT equipment_maintenance_expense_id_key UNIQUE (expense_id);


--
-- Name: equipment_maintenance equipment_maintenance_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment_maintenance
    ADD CONSTRAINT equipment_maintenance_pkey PRIMARY KEY (id);


--
-- Name: equipment equipment_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment
    ADD CONSTRAINT equipment_pkey PRIMARY KEY (id);


--
-- Name: equipment equipment_serial_number_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment
    ADD CONSTRAINT equipment_serial_number_key UNIQUE (serial_number);


--
-- Name: event_types event_types_name_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.event_types
    ADD CONSTRAINT event_types_name_key UNIQUE (name);


--
-- Name: event_types event_types_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.event_types
    ADD CONSTRAINT event_types_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_idempotency_key_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.invoices
    ADD CONSTRAINT invoices_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: packages packages_name_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.packages
    ADD CONSTRAINT packages_name_key UNIQUE (name);


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: payments payments_idempotency_key_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.payments
    ADD CONSTRAINT payments_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staff staff_user_id_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.staff
    ADD CONSTRAINT staff_user_id_key UNIQUE (user_id);


--
-- Name: studio_settings studio_settings_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.studio_settings
    ADD CONSTRAINT studio_settings_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: albums_booking_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX albums_booking_idx ON studio.albums USING btree (booking_id);


--
-- Name: albums_status_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX albums_status_idx ON studio.albums USING btree (status);


--
-- Name: bookings_customer_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX bookings_customer_idx ON studio.bookings USING btree (customer_id);


--
-- Name: bookings_date_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX bookings_date_idx ON studio.bookings USING btree (event_date);


--
-- Name: customers_search_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX customers_search_idx ON studio.customers USING btree (lower(name));


--
-- Name: equipment_assignments_booking_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX equipment_assignments_booking_idx ON studio.equipment_assignments USING btree (booking_id);


--
-- Name: equipment_assignments_lookup_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX equipment_assignments_lookup_idx ON studio.equipment_assignments USING btree (equipment_id, assigned_date, expected_return_date) WHERE (status = 'Active'::text);


--
-- Name: equipment_category_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX equipment_category_idx ON studio.equipment USING btree (category);


--
-- Name: equipment_maintenance_equipment_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX equipment_maintenance_equipment_idx ON studio.equipment_maintenance USING btree (equipment_id);


--
-- Name: equipment_one_open_service; Type: INDEX; Schema: studio; Owner: -
--

CREATE UNIQUE INDEX equipment_one_open_service ON studio.equipment_maintenance USING btree (equipment_id) WHERE (status = 'In progress'::text);


--
-- Name: expenses_date_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX expenses_date_idx ON studio.expenses USING btree (date);


--
-- Name: invoice_items_invoice_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX invoice_items_invoice_idx ON studio.invoice_items USING btree (invoice_id);


--
-- Name: invoices_customer_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX invoices_customer_idx ON studio.invoices USING btree (customer_id);


--
-- Name: invoices_date_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX invoices_date_idx ON studio.invoices USING btree (invoice_date);


--
-- Name: invoices_one_active_booking; Type: INDEX; Schema: studio; Owner: -
--

CREATE UNIQUE INDEX invoices_one_active_booking ON studio.invoices USING btree (booking_id) WHERE (status = 'Issued'::text);


--
-- Name: payments_booking_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX payments_booking_idx ON studio.payments USING btree (booking_id);


--
-- Name: payments_date_idx; Type: INDEX; Schema: studio; Owner: -
--

CREATE INDEX payments_date_idx ON studio.payments USING btree (date);


--
-- Name: bookings protect_invoiced_booking; Type: TRIGGER; Schema: studio; Owner: -
--

CREATE TRIGGER protect_invoiced_booking BEFORE UPDATE ON studio.bookings FOR EACH ROW EXECUTE FUNCTION studio.protect_invoiced_booking();


--
-- Name: expenses protect_maintenance_expense; Type: TRIGGER; Schema: studio; Owner: -
--

CREATE TRIGGER protect_maintenance_expense BEFORE DELETE OR UPDATE ON studio.expenses FOR EACH ROW EXECUTE FUNCTION studio.protect_maintenance_expense();


--
-- Name: albums albums_booking_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.albums
    ADD CONSTRAINT albums_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio.bookings(id);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES studio.users(id);


--
-- Name: booking_staff booking_staff_booking_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.booking_staff
    ADD CONSTRAINT booking_staff_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_staff booking_staff_staff_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.booking_staff
    ADD CONSTRAINT booking_staff_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES studio.staff(id);


--
-- Name: bookings bookings_customer_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.bookings
    ADD CONSTRAINT bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES studio.customers(id);


--
-- Name: bookings bookings_event_type_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.bookings
    ADD CONSTRAINT bookings_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES studio.event_types(id);


--
-- Name: bookings bookings_package_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.bookings
    ADD CONSTRAINT bookings_package_id_fkey FOREIGN KEY (package_id) REFERENCES studio.packages(id);


--
-- Name: equipment_assignments equipment_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment_assignments
    ADD CONSTRAINT equipment_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES studio.users(id);


--
-- Name: equipment_assignments equipment_assignments_booking_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment_assignments
    ADD CONSTRAINT equipment_assignments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio.bookings(id);


--
-- Name: equipment_assignments equipment_assignments_equipment_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment_assignments
    ADD CONSTRAINT equipment_assignments_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES studio.equipment(id);


--
-- Name: equipment_maintenance equipment_maintenance_created_by_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment_maintenance
    ADD CONSTRAINT equipment_maintenance_created_by_fkey FOREIGN KEY (created_by) REFERENCES studio.users(id);


--
-- Name: equipment_maintenance equipment_maintenance_equipment_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment_maintenance
    ADD CONSTRAINT equipment_maintenance_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES studio.equipment(id);


--
-- Name: equipment_maintenance equipment_maintenance_expense_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.equipment_maintenance
    ADD CONSTRAINT equipment_maintenance_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES studio.expenses(id);


--
-- Name: expenses expenses_booking_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.expenses
    ADD CONSTRAINT expenses_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio.bookings(id);


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES studio.invoices(id);


--
-- Name: invoices invoices_booking_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.invoices
    ADD CONSTRAINT invoices_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio.bookings(id);


--
-- Name: invoices invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.invoices
    ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES studio.users(id);


--
-- Name: invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES studio.customers(id);


--
-- Name: invoices invoices_voided_by_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.invoices
    ADD CONSTRAINT invoices_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES studio.users(id);


--
-- Name: payments payments_booking_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.payments
    ADD CONSTRAINT payments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio.bookings(id);


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES studio.users(id);


--
-- Name: staff staff_user_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.staff
    ADD CONSTRAINT staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES studio.users(id);


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: studio; Owner: -
--

ALTER TABLE ONLY studio.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES studio.roles(id);


--
-- PostgreSQL database dump complete
--

\unrestrict RpD2f7VAonJdgJNbZdumxNo8m7tfTpWeMrn5HhDjwemsYWAT8gaBtf00QLVHbqG

