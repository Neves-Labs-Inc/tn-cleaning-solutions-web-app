// Hand-maintained. Every schema change lands here in the same task that writes the migration.
//
// The `Relationships` and `Functions` members are not decoration: supabase-js resolves
// `SupabaseClient<Database>` through `Database['public'] extends GenericSchema ? ... : never`, and
// GenericSchema requires a `Relationships` array on every table and view plus a `Functions` map.
// Without them the whole type silently degrades to `never`, `.from(...).select(...)` returns
// `never` rows, and nothing here checks anything. Added 2026-09-18 after exactly that: the type had
// been inert since the supabase-js 2.104 typings landed.
//
// Relationships lists the real foreign keys of the public schema, because that is what PostgREST
// embeds resolve against. Two known omissions, both deliberate: `employees.user_id` points at
// `auth.users`, which is not in this type and cannot be embedded from `public`; and the views carry
// an empty list because no caller embeds through a view on a typed client. The four
// `*_employee_view` views are security_invoker views over SECURITY DEFINER functions in the
// unexposed `private` schema (20261004120000), so they have no foreign keys for PostgREST to infer:
// their embeds go through computed relationships, SQL functions in `public` named after the embed
// target (`appointments_employee_view`, `employees_employee_view`, `clients`, `client_locations`,
// `jobs_employee_view`). Functions lists the invoice write functions (20261009140000 onward), the
// RPCs the invoice ledger calls through the typed session client; `p_lines` is the Billed amounts
// TypeScript priced. The other SQL functions are called through untyped clients and stay out until a
// typed caller needs them. Every invoice function refuses through `invoice_error`: the PostgREST
// error's `details` is the code.
//
// `invoices_with_status` is a security_invoker projection of `invoices`, one row per invoice.
// Its Row follows the database's real column nullability, not the narrowed `invoices` Row: `notes`,
// `created_at` and `updated_at` have no NOT NULL constraint on the table, so they are nullable here.
// `total_cents` is derived: the sum of the invoice's live, uncancelled lines (0 when none).
// `effective_status` is `status` with an issued, past-due invoice reported as 'overdue'.
//
// `npm run db:check-types` (run in CI) fails when a table, view or column name here and in the
// database `public` schema disagree. It compares names only, never types or nullability.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string
          user_id: string
          full_name: string
          phone: string
          started_at: string | null
          address: string | null
          e_transfer_email: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          is_archived: boolean
        }
        Insert: {
          id?: string
          user_id: string
          full_name: string
          phone: string
          started_at?: string | null
          address?: string | null
          e_transfer_email?: string | null
          is_active: boolean
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          full_name?: string
          phone?: string
          started_at?: string | null
          address?: string | null
          e_transfer_email?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          name: string
          email: string
          phone: string
          address: string
          notes: string
          is_active: boolean
          automatic_invoicing: boolean
          created_at: string
          updated_at: string
          is_archived: boolean
        }
        Insert: {
          id?: string
          name: string
          email: string
          phone: string
          address: string
          notes: string
          is_active: boolean
          automatic_invoicing?: boolean
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Update: {
          id?: string
          name?: string
          email?: string
          phone?: string
          address?: string
          notes?: string
          is_active?: boolean
          automatic_invoicing?: boolean
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Relationships: []
      }
      client_locations: {
        Row: {
          id: string
          client_id: string
          label: string
          address: string
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          is_archived: boolean
        }
        Insert: {
          id?: string
          client_id: string
          label?: string
          address: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Update: {
          id?: string
          client_id?: string
          label?: string
          address?: string
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'client_locations_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
        ]
      }
      jobs: {
        Row: {
          id: string
          name: string
          description: string | null
          hourly_rate_cents: number
          estimated_duration_minutes: number | null
          created_at: string
          updated_at: string
          is_archived: boolean
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          hourly_rate_cents: number
          estimated_duration_minutes?: number | null
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          hourly_rate_cents?: number
          estimated_duration_minutes?: number | null
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Relationships: []
      }
      client_job_pricing: {
        Row: {
          id: string
          client_id: string
          job_id: string
          hourly_rate_cents: number
          effective_from: string
          notes: string | null
          created_at: string | null
          updated_at: string | null
          is_archived: boolean
        }
        Insert: {
          id?: string
          client_id: string
          job_id: string
          hourly_rate_cents: number
          effective_from: string
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_archived?: boolean
        }
        Update: {
          id?: string
          client_id?: string
          job_id?: string
          hourly_rate_cents?: number
          effective_from?: string
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_archived?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'client_job_pricing_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'client_job_pricing_job_id_fkey'
            columns: ['job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['id']
          },
        ]
      }
      recurrence_series: {
        Row: {
          id: string
          frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
          start_date: string
          end_date: string | null
          max_occurrences: number | null
          client_id: string
          job_id: string
          location_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          is_archived: boolean
        }
        Insert: {
          id?: string
          frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
          start_date: string
          end_date?: string | null
          max_occurrences?: number | null
          client_id: string
          job_id: string
          location_id?: string | null
          is_active: boolean
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Update: {
          id?: string
          frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly'
          start_date?: string
          end_date?: string | null
          max_occurrences?: number | null
          client_id?: string
          job_id?: string
          location_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'recurrence_series_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recurrence_series_job_id_fkey'
            columns: ['job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recurrence_series_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'client_locations'
            referencedColumns: ['id']
          },
        ]
      }
      appointments: {
        Row: {
          id: string
          client_id: string
          job_id: string
          recurrence_series_id: string | null
          location_id: string | null
          scheduled_date: string
          scheduled_start_time: string
          scheduled_end_time: string
          price_override_cents: number | null
          status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
          manually_completed: boolean
          completed_at: string | null
          excluded_from_automatic: boolean
          notes: string
          created_at: string
          updated_at: string
          is_archived: boolean
        }
        Insert: {
          id?: string
          client_id: string
          job_id: string
          recurrence_series_id?: string | null
          location_id?: string | null
          scheduled_date: string
          scheduled_start_time: string
          scheduled_end_time: string
          price_override_cents?: number | null
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
          manually_completed?: boolean
          completed_at?: string | null
          excluded_from_automatic?: boolean
          notes: string
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Update: {
          id?: string
          client_id?: string
          job_id?: string
          recurrence_series_id?: string | null
          location_id?: string | null
          scheduled_date?: string
          scheduled_start_time?: string
          scheduled_end_time?: string
          price_override_cents?: number | null
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
          manually_completed?: boolean
          completed_at?: string | null
          excluded_from_automatic?: boolean
          notes?: string
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'appointments_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_job_id_fkey'
            columns: ['job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_location_id_fkey'
            columns: ['location_id']
            isOneToOne: false
            referencedRelation: 'client_locations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_recurrence_series_id_fkey'
            columns: ['recurrence_series_id']
            isOneToOne: false
            referencedRelation: 'recurrence_series'
            referencedColumns: ['id']
          },
        ]
      }
      appointment_employees: {
        Row: {
          id: string
          appointment_id: string
          employee_id: string
          clocked_in_at: string | null
          clocked_out_at: string | null
          admin_notes: string
          created_at: string
          updated_at: string
          is_archived: boolean
        }
        Insert: {
          id?: string
          appointment_id: string
          employee_id: string
          clocked_in_at?: string | null
          clocked_out_at?: string | null
          admin_notes: string
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Update: {
          id?: string
          appointment_id?: string
          employee_id?: string
          clocked_in_at?: string | null
          clocked_out_at?: string | null
          admin_notes?: string
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'appointment_employees_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointment_employees_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      invoices: {
        Row: {
          id: string
          client_id: string
          status: 'draft' | 'issued' | 'paid' | 'void'
          issued_date: string | null
          due_date: string | null
          notes: string
          created_at: string
          updated_at: string
          is_archived: boolean
          invoice_number: string | null
          is_automatic: boolean
          paid_date: string | null
          payment_method: string | null
          payment_reference: string | null
        }
        Insert: {
          id?: string
          client_id: string
          status?: 'draft' | 'issued' | 'paid' | 'void'
          issued_date?: string | null
          due_date?: string | null
          notes: string
          created_at?: string
          updated_at?: string
          is_archived?: boolean
          invoice_number?: string | null
          is_automatic?: boolean
          paid_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          status?: 'draft' | 'issued' | 'paid' | 'void'
          issued_date?: string | null
          due_date?: string | null
          notes?: string
          created_at?: string
          updated_at?: string
          is_archived?: boolean
          invoice_number?: string | null
          is_automatic?: boolean
          paid_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'invoices_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
        ]
      }
      invoice_appointments: {
        Row: {
          invoice_id: string
          appointment_id: string
          billed_amount_cents: number | null
          billed_rate_cents: number | null
          billed_minutes: number | null
          cancelled_at: string | null
          created_at: string
          updated_at: string
          is_archived: boolean
        }
        Insert: {
          invoice_id: string
          appointment_id: string
          billed_amount_cents?: number | null
          billed_rate_cents?: number | null
          billed_minutes?: number | null
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Update: {
          invoice_id?: string
          appointment_id?: string
          billed_amount_cents?: number | null
          billed_rate_cents?: number | null
          billed_minutes?: number | null
          cancelled_at?: string | null
          created_at?: string
          updated_at?: string
          is_archived?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'invoice_appointments_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_appointments_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          },
        ]
      }
      payment_methods: {
        Row: {
          id: string
          name: string
          is_hidden: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          is_hidden?: boolean
          sort_order: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          is_hidden?: boolean
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      invoice_number_counters: {
        Row: {
          year: number
          last_value: number
        }
        Insert: {
          year: number
          last_value?: number
        }
        Update: {
          year?: number
          last_value?: number
        }
        Relationships: []
      }
    }
    Views: {
      appointment_employees_employee_view: {
        Row: {
          id: string
          appointment_id: string
          employee_id: string
          clocked_in_at: string | null
          clocked_out_at: string | null
          created_at: string
          updated_at: string
          is_archived: boolean
        }
        Relationships: []
      }
      appointments_employee_view: {
        Row: {
          id: string
          client_id: string
          job_id: string
          recurrence_series_id: string | null
          scheduled_date: string
          scheduled_start_time: string
          scheduled_end_time: string
          status: string
          notes: string | null
          created_at: string | null
          updated_at: string | null
          is_archived: boolean | null
          location_id: string | null
          manually_completed: boolean | null
        }
        Relationships: []
      }
      employees_employee_view: {
        Row: {
          id: string
          user_id: string
          full_name: string
          phone: string | null
          started_at: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          is_archived: boolean
        }
        Relationships: []
      }
      invoices_with_status: {
        Row: {
          id: string
          client_id: string
          status: 'draft' | 'issued' | 'paid' | 'void'
          issued_date: string | null
          due_date: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          is_archived: boolean
          invoice_number: string | null
          is_automatic: boolean
          paid_date: string | null
          payment_method: string | null
          payment_reference: string | null
          total_cents: number
          effective_status: 'draft' | 'issued' | 'paid' | 'void' | 'overdue'
        }
        Relationships: []
      }
      jobs_employee_view: {
        Row: {
          id: string
          name: string
          description: string | null
          is_archived: boolean
        }
        Relationships: []
      }
    }
    Functions: {
      invoice_archive: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      invoice_create_draft: {
        Args: {
          p_client_id: string
          p_appointment_ids: string[]
          p_due_date: string | null
          p_notes: string | null
        }
        Returns: string
      }
      invoice_issue: {
        Args: { p_invoice_id: string; p_lines: Json; p_due_date: string | null }
        Returns: string
      }
      invoice_record_payment: {
        Args: { p_invoice_id: string; p_paid_date: string | null; p_method: string; p_reference: string | null }
        Returns: undefined
      }
      invoice_unarchive: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      invoice_undo_payment: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      invoice_update_draft: {
        Args: {
          p_invoice_id: string
          p_add_appointment_ids: string[]
          p_remove_appointment_ids: string[]
          p_due_date: string | null
          p_notes: string | null
        }
        Returns: undefined
      }
      invoice_update_payment: {
        Args: { p_invoice_id: string; p_paid_date: string | null; p_method: string; p_reference: string | null }
        Returns: undefined
      }
      invoice_void: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
export type Views<T extends keyof Database['public']['Views']> = Database['public']['Views'][T]['Row']