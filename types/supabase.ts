export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_preferences: {
        Row: {
          checkin_days: number
          language: string
          low_adherence: number
          reminders: boolean
          user_id: string
          weight_days: number
        }
        Insert: {
          checkin_days?: number
          language?: string
          low_adherence?: number
          reminders?: boolean
          user_id: string
          weight_days?: number
        }
        Update: {
          checkin_days?: number
          language?: string
          low_adherence?: number
          reminders?: boolean
          user_id?: string
          weight_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit: {
        Row: {
          action: string
          actor_id: string
          client_id: string | null
          coach_id: string
          created_at: string
          detail: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id: string
          client_id?: string | null
          coach_id: string
          created_at?: string
          detail?: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string
          client_id?: string | null
          coach_id?: string
          created_at?: string
          detail?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bk_account_preferences_20261114: {
        Row: {
          checkin_days: number | null
          language: string | null
          low_adherence: number | null
          reminders: boolean | null
          user_id: string | null
          weight_days: number | null
        }
        Insert: {
          checkin_days?: number | null
          language?: string | null
          low_adherence?: number | null
          reminders?: boolean | null
          user_id?: string | null
          weight_days?: number | null
        }
        Update: {
          checkin_days?: number | null
          language?: string | null
          low_adherence?: number | null
          reminders?: boolean | null
          user_id?: string | null
          weight_days?: number | null
        }
        Relationships: []
      }
      bk_audit_20261114: {
        Row: {
          action: string | null
          actor_id: string | null
          client_id: string | null
          coach_id: string | null
          created_at: string | null
          detail: string | null
          entity_id: string | null
          id: string | null
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          client_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          detail?: string | null
          entity_id?: string | null
          id?: string | null
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          client_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          detail?: string | null
          entity_id?: string | null
          id?: string | null
        }
        Relationships: []
      }
      bk_client_checkin_schedules_20261114: {
        Row: {
          client_id: string | null
          coach_id: string | null
          measurement_days: number | null
          photo_days: number | null
          updated_at: string | null
          weight_days: number | null
        }
        Insert: {
          client_id?: string | null
          coach_id?: string | null
          measurement_days?: number | null
          photo_days?: number | null
          updated_at?: string | null
          weight_days?: number | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string | null
          measurement_days?: number | null
          photo_days?: number | null
          updated_at?: string | null
          weight_days?: number | null
        }
        Relationships: []
      }
      bk_client_consents_20261114: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          client_id: string | null
          coach_id: string | null
          consent_type: string | null
          created_at: string | null
          id: string | null
          revoked_at: string | null
          version: number | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id?: string | null
          coach_id?: string | null
          consent_type?: string | null
          created_at?: string | null
          id?: string | null
          revoked_at?: string | null
          version?: number | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id?: string | null
          coach_id?: string | null
          consent_type?: string | null
          created_at?: string | null
          id?: string | null
          revoked_at?: string | null
          version?: number | null
        }
        Relationships: []
      }
      bk_client_details_20261114: {
        Row: {
          age: number | null
          birth_date: string | null
          client_id: string | null
          coach_id: string | null
          gender: string | null
          height: number | null
          start_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          age?: number | null
          birth_date?: string | null
          client_id?: string | null
          coach_id?: string | null
          gender?: string | null
          height?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          age?: number | null
          birth_date?: string | null
          client_id?: string | null
          coach_id?: string | null
          gender?: string | null
          height?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bk_client_goals_20261114: {
        Row: {
          client_id: string | null
          coach_id: string | null
          focus: string | null
          goal: string | null
          notes: string | null
          target_weight: number | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          coach_id?: string | null
          focus?: string | null
          goal?: string | null
          notes?: string | null
          target_weight?: number | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string | null
          focus?: string | null
          goal?: string | null
          notes?: string | null
          target_weight?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bk_clients_20261114: {
        Row: {
          archived: boolean | null
          archived_at: string | null
          archived_reason: string | null
          coach_id: string | null
          created_at: string | null
          email: string | null
          id: string | null
          name: string | null
          phone: string | null
          trainee_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          archived_at?: string | null
          archived_reason?: string | null
          coach_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          trainee_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          archived_at?: string | null
          archived_reason?: string | null
          coach_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          trainee_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bk_clients_full_20261114: {
        Row: {
          archived: boolean | null
          archived_at: string | null
          archived_reason: string | null
          coach_id: string | null
          created_at: string | null
          email: string | null
          id: string | null
          name: string | null
          phone: string | null
          trainee_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          archived_at?: string | null
          archived_reason?: string | null
          coach_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          trainee_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          archived_at?: string | null
          archived_reason?: string | null
          coach_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          trainee_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bk_coach_branding_20261114: {
        Row: {
          avatar_base64: string | null
          avatar_id: string | null
          coach_id: string | null
          display_name: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_base64?: string | null
          avatar_id?: string | null
          coach_id?: string | null
          display_name?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_base64?: string | null
          avatar_id?: string | null
          coach_id?: string | null
          display_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bk_coaching_records_20261114: {
        Row: {
          author_id: string | null
          author_type: string | null
          client_id: string | null
          coach_feedback: string | null
          coach_id: string | null
          created_at: string | null
          entry_date: string | null
          id: string | null
          kind: string | null
          modified_by_type: string | null
          payload: Json | null
          read_at: string | null
          reviewed_at: string | null
          revision: number | null
          source_key: string | null
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          author_type?: string | null
          client_id?: string | null
          coach_feedback?: string | null
          coach_id?: string | null
          created_at?: string | null
          entry_date?: string | null
          id?: string | null
          kind?: string | null
          modified_by_type?: string | null
          payload?: Json | null
          read_at?: string | null
          reviewed_at?: string | null
          revision?: number | null
          source_key?: string | null
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          author_type?: string | null
          client_id?: string | null
          coach_feedback?: string | null
          coach_id?: string | null
          created_at?: string | null
          entry_date?: string | null
          id?: string | null
          kind?: string | null
          modified_by_type?: string | null
          payload?: Json | null
          read_at?: string | null
          reviewed_at?: string | null
          revision?: number | null
          source_key?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bk_exercises_20261114: {
        Row: {
          coach_id: string | null
          created_at: string | null
          description: string | null
          id: string | null
          name: string | null
          video: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          video?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          name?: string | null
          video?: string | null
        }
        Relationships: []
      }
      bk_freezes_20261114: {
        Row: {
          applied_at: string | null
          coach_id: string | null
          days: number | null
          end_date: string | null
          id: string | null
          start_date: string | null
          subscription_id: string | null
        }
        Insert: {
          applied_at?: string | null
          coach_id?: string | null
          days?: number | null
          end_date?: string | null
          id?: string | null
          start_date?: string | null
          subscription_id?: string | null
        }
        Update: {
          applied_at?: string | null
          coach_id?: string | null
          days?: number | null
          end_date?: string | null
          id?: string | null
          start_date?: string | null
          subscription_id?: string | null
        }
        Relationships: []
      }
      bk_import_batches_20261114: {
        Row: {
          changes: Json | null
          coach_id: string | null
          created_at: string | null
          fingerprint: string | null
          id: string | null
          report: Json | null
          status: string | null
        }
        Insert: {
          changes?: Json | null
          coach_id?: string | null
          created_at?: string | null
          fingerprint?: string | null
          id?: string | null
          report?: Json | null
          status?: string | null
        }
        Update: {
          changes?: Json | null
          coach_id?: string | null
          created_at?: string | null
          fingerprint?: string | null
          id?: string | null
          report?: Json | null
          status?: string | null
        }
        Relationships: []
      }
      bk_import_subscription_refs_20261114: {
        Row: {
          client_id: string | null
          coach_id: string | null
          source_ref: string | null
          subscription_id: string | null
        }
        Insert: {
          client_id?: string | null
          coach_id?: string | null
          source_ref?: string | null
          subscription_id?: string | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string | null
          source_ref?: string | null
          subscription_id?: string | null
        }
        Relationships: []
      }
      bk_invitations_20261114: {
        Row: {
          client_id: string | null
          coach_id: string | null
          consumed_at: string | null
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string | null
          revoked_at: string | null
          token_hash: string | null
        }
        Insert: {
          client_id?: string | null
          coach_id?: string | null
          consumed_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          revoked_at?: string | null
          token_hash?: string | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string | null
          consumed_at?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          revoked_at?: string | null
          token_hash?: string | null
        }
        Relationships: []
      }
      bk_join_links_20261114: {
        Row: {
          coach_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          revoked_at: string | null
          token_hash: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          revoked_at?: string | null
          token_hash?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          revoked_at?: string | null
          token_hash?: string | null
        }
        Relationships: []
      }
      bk_join_requests_20261114: {
        Row: {
          coach_id: string | null
          created_at: string | null
          email: string | null
          id: string | null
          name: string | null
          phone: string | null
          status: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          status?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          status?: string | null
        }
        Relationships: []
      }
      bk_media_assets_20261114: {
        Row: {
          coach_id: string | null
          created_at: string | null
          filename: string | null
          id: string | null
          mime: string | null
          path: string | null
          size: number | null
          status: string | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          filename?: string | null
          id?: string | null
          mime?: string | null
          path?: string | null
          size?: number | null
          status?: string | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          filename?: string | null
          id?: string | null
          mime?: string | null
          path?: string | null
          size?: number | null
          status?: string | null
        }
        Relationships: []
      }
      bk_paylink_invoices_20261114: {
        Row: {
          amount: number | null
          client_id: string | null
          coach_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          order_number: string | null
          payment_errors: Json | null
          payment_id: string | null
          payment_type: string | null
          payment_url: string | null
          review_reason: string | null
          settled_at: string | null
          status: string | null
          subscription_id: string | null
          transaction_no: string | null
        }
        Insert: {
          amount?: number | null
          client_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          order_number?: string | null
          payment_errors?: Json | null
          payment_id?: string | null
          payment_type?: string | null
          payment_url?: string | null
          review_reason?: string | null
          settled_at?: string | null
          status?: string | null
          subscription_id?: string | null
          transaction_no?: string | null
        }
        Update: {
          amount?: number | null
          client_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          order_number?: string | null
          payment_errors?: Json | null
          payment_id?: string | null
          payment_type?: string | null
          payment_url?: string | null
          review_reason?: string | null
          settled_at?: string | null
          status?: string | null
          subscription_id?: string | null
          transaction_no?: string | null
        }
        Relationships: []
      }
      bk_payments_20261114: {
        Row: {
          amount: number | null
          coach_id: string | null
          created_at: string | null
          id: string | null
          kind: string | null
          method: string | null
          paid_date: string | null
          reason: string | null
          reference: string | null
          reverses: string | null
          subscription_id: string | null
        }
        Insert: {
          amount?: number | null
          coach_id?: string | null
          created_at?: string | null
          id?: string | null
          kind?: string | null
          method?: string | null
          paid_date?: string | null
          reason?: string | null
          reference?: string | null
          reverses?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number | null
          coach_id?: string | null
          created_at?: string | null
          id?: string | null
          kind?: string | null
          method?: string | null
          paid_date?: string | null
          reason?: string | null
          reference?: string | null
          reverses?: string | null
          subscription_id?: string | null
        }
        Relationships: []
      }
      bk_portal_links_20261114: {
        Row: {
          access_mode: string | null
          attempt_window: string | null
          attempts: number | null
          client_id: string | null
          coach_id: string | null
          expires_at: string | null
          id: string | null
          last_opened_at: string | null
          proof_hash: string | null
          revoked_at: string | null
          token_hash: string | null
        }
        Insert: {
          access_mode?: string | null
          attempt_window?: string | null
          attempts?: number | null
          client_id?: string | null
          coach_id?: string | null
          expires_at?: string | null
          id?: string | null
          last_opened_at?: string | null
          proof_hash?: string | null
          revoked_at?: string | null
          token_hash?: string | null
        }
        Update: {
          access_mode?: string | null
          attempt_window?: string | null
          attempts?: number | null
          client_id?: string | null
          coach_id?: string | null
          expires_at?: string | null
          id?: string | null
          last_opened_at?: string | null
          proof_hash?: string | null
          revoked_at?: string | null
          token_hash?: string | null
        }
        Relationships: []
      }
      bk_privacy_requests_20261114: {
        Row: {
          client_id: string | null
          coach_id: string | null
          created_at: string | null
          details: string | null
          id: string | null
          kind: string | null
          resolution: string | null
          status: string | null
        }
        Insert: {
          client_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          details?: string | null
          id?: string | null
          kind?: string | null
          resolution?: string | null
          status?: string | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          details?: string | null
          id?: string | null
          kind?: string | null
          resolution?: string | null
          status?: string | null
        }
        Relationships: []
      }
      bk_private_coaching_record_versions_20261114: {
        Row: {
          actor_id: string | null
          actor_type: string | null
          changed_at: string | null
          id: string | null
          previous_entry_date: string | null
          previous_payload: Json | null
          previous_revision: number | null
          record_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string | null
          changed_at?: string | null
          id?: string | null
          previous_entry_date?: string | null
          previous_payload?: Json | null
          previous_revision?: number | null
          record_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string | null
          changed_at?: string | null
          id?: string | null
          previous_entry_date?: string | null
          previous_payload?: Json | null
          previous_revision?: number | null
          record_id?: string | null
        }
        Relationships: []
      }
      bk_private_paylink_accounts_20261114: {
        Row: {
          coach_id: string | null
          sealed: string | null
          updated_at: string | null
        }
        Insert: {
          coach_id?: string | null
          sealed?: string | null
          updated_at?: string | null
        }
        Update: {
          coach_id?: string | null
          sealed?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bk_private_progress_photo_deletions_20261114: {
        Row: {
          asset_path: string | null
          coach_id: string | null
          created_at: string | null
          id: string | null
        }
        Insert: {
          asset_path?: string | null
          coach_id?: string | null
          created_at?: string | null
          id?: string | null
        }
        Update: {
          asset_path?: string | null
          coach_id?: string | null
          created_at?: string | null
          id?: string | null
        }
        Relationships: []
      }
      bk_private_template_assignment_receipts_20261114: {
        Row: {
          coach_id: string | null
          created_at: string | null
          fingerprint: Json | null
          operation_id: string | null
          result: Json | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string | null
          fingerprint?: Json | null
          operation_id?: string | null
          result?: Json | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string | null
          fingerprint?: Json | null
          operation_id?: string | null
          result?: Json | null
        }
        Relationships: []
      }
      bk_private_trainee_portal_sessions_20261114: {
        Row: {
          created_at: string | null
          expires_at: string | null
          portal_id: string | null
          session_hash: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          portal_id?: string | null
          session_hash?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          portal_id?: string | null
          session_hash?: string | null
        }
        Relationships: []
      }
      bk_profiles_20261114: {
        Row: {
          created_at: string | null
          email: string | null
          id: string | null
          name: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          role?: string | null
        }
        Relationships: []
      }
      bk_programs_20261114: {
        Row: {
          client_id: string | null
          coach_id: string | null
          content: Json | null
          created_at: string | null
          edit_revision: number | null
          id: string | null
          name: string | null
          published_at: string | null
          version: number | null
        }
        Insert: {
          client_id?: string | null
          coach_id?: string | null
          content?: Json | null
          created_at?: string | null
          edit_revision?: number | null
          id?: string | null
          name?: string | null
          published_at?: string | null
          version?: number | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string | null
          content?: Json | null
          created_at?: string | null
          edit_revision?: number | null
          id?: string | null
          name?: string | null
          published_at?: string | null
          version?: number | null
        }
        Relationships: []
      }
      bk_progress_photos_20261114: {
        Row: {
          angle: string | null
          author_id: string | null
          client_id: string | null
          coach_id: string | null
          consent_source: string | null
          consented_at: string | null
          created_at: string | null
          entry_date: string | null
          filename: string | null
          id: string | null
          mime: string | null
          size: number | null
          status: string | null
        }
        Insert: {
          angle?: string | null
          author_id?: string | null
          client_id?: string | null
          coach_id?: string | null
          consent_source?: string | null
          consented_at?: string | null
          created_at?: string | null
          entry_date?: string | null
          filename?: string | null
          id?: string | null
          mime?: string | null
          size?: number | null
          status?: string | null
        }
        Update: {
          angle?: string | null
          author_id?: string | null
          client_id?: string | null
          coach_id?: string | null
          consent_source?: string | null
          consented_at?: string | null
          created_at?: string | null
          entry_date?: string | null
          filename?: string | null
          id?: string | null
          mime?: string | null
          size?: number | null
          status?: string | null
        }
        Relationships: []
      }
      bk_scope_clients: {
        Row: {
          coach_id: string | null
          id: string | null
        }
        Insert: {
          coach_id?: string | null
          id?: string | null
        }
        Update: {
          coach_id?: string | null
          id?: string | null
        }
        Relationships: []
      }
      bk_scope_users: {
        Row: {
          id: string | null
        }
        Insert: {
          id?: string | null
        }
        Update: {
          id?: string | null
        }
        Relationships: []
      }
      bk_subscriptions_20261114: {
        Row: {
          client_id: string | null
          coach_id: string | null
          created_at: string | null
          end_date: string | null
          id: string | null
          name: string | null
          previous_id: string | null
          price: number | null
          start_date: string | null
        }
        Insert: {
          client_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string | null
          name?: string | null
          previous_id?: string | null
          price?: number | null
          start_date?: string | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string | null
          name?: string | null
          previous_id?: string | null
          price?: number | null
          start_date?: string | null
        }
        Relationships: []
      }
      bk_support_tickets_20261114: {
        Row: {
          attachment_path: string | null
          author_id: string | null
          created_at: string | null
          description: string | null
          id: string | null
          kind: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          attachment_path?: string | null
          author_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          kind?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          attachment_path?: string | null
          author_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          kind?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bk_template_metadata_20261114: {
        Row: {
          archived: boolean | null
          coach_id: string | null
          days_per_week: number | null
          description: string | null
          goal: string | null
          import_key: string | null
          kind: string | null
          last_used_at: string | null
          level: string | null
          template_id: string | null
        }
        Insert: {
          archived?: boolean | null
          coach_id?: string | null
          days_per_week?: number | null
          description?: string | null
          goal?: string | null
          import_key?: string | null
          kind?: string | null
          last_used_at?: string | null
          level?: string | null
          template_id?: string | null
        }
        Update: {
          archived?: boolean | null
          coach_id?: string | null
          days_per_week?: number | null
          description?: string | null
          goal?: string | null
          import_key?: string | null
          kind?: string | null
          last_used_at?: string | null
          level?: string | null
          template_id?: string | null
        }
        Relationships: []
      }
      bk_templates_20261114: {
        Row: {
          coach_id: string | null
          content: Json | null
          id: string | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          coach_id?: string | null
          content?: Json | null
          id?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          coach_id?: string | null
          content?: Json | null
          id?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bk_upload_sessions_20261114: {
        Row: {
          asset_id: string | null
          coach_id: string | null
          created_at: string | null
          expires_at: string | null
          filename: string | null
          mime: string | null
          size: number | null
          token_hash: string | null
        }
        Insert: {
          asset_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          filename?: string | null
          mime?: string | null
          size?: number | null
          token_hash?: string | null
        }
        Update: {
          asset_id?: string | null
          coach_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          filename?: string | null
          mime?: string | null
          size?: number | null
          token_hash?: string | null
        }
        Relationships: []
      }
      bk_weight_entries_20261114: {
        Row: {
          client_id: string | null
          coach_id: string | null
          entry_date: string | null
          id: string | null
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          client_id?: string | null
          coach_id?: string | null
          entry_date?: string | null
          id?: string | null
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          client_id?: string | null
          coach_id?: string | null
          entry_date?: string | null
          id?: string | null
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: []
      }
      client_checkin_schedules: {
        Row: {
          client_id: string
          coach_id: string
          measurement_days: number
          photo_days: number
          updated_at: string
          weight_days: number
        }
        Insert: {
          client_id: string
          coach_id: string
          measurement_days: number
          photo_days: number
          updated_at?: string
          weight_days: number
        }
        Update: {
          client_id?: string
          coach_id?: string
          measurement_days?: number
          photo_days?: number
          updated_at?: string
          weight_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_checkin_schedules_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
          {
            foreignKeyName: "client_checkin_schedules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_checkin_schedules_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_consents: {
        Row: {
          accepted_at: string
          accepted_by: string | null
          client_id: string
          coach_id: string
          consent_type: string
          created_at: string
          id: string
          revoked_at: string | null
          version: number
        }
        Insert: {
          accepted_at?: string
          accepted_by?: string | null
          client_id: string
          coach_id: string
          consent_type: string
          created_at?: string
          id?: string
          revoked_at?: string | null
          version: number
        }
        Update: {
          accepted_at?: string
          accepted_by?: string | null
          client_id?: string
          coach_id?: string
          consent_type?: string
          created_at?: string
          id?: string
          revoked_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_consents_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_consents_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      client_details: {
        Row: {
          age: number | null
          birth_date: string | null
          client_id: string
          coach_id: string
          gender: string
          height: number | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          age?: number | null
          birth_date?: string | null
          client_id: string
          coach_id: string
          gender?: string
          height?: number | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          age?: number | null
          birth_date?: string | null
          client_id?: string
          coach_id?: string
          gender?: string
          height?: number | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_details_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      client_goals: {
        Row: {
          client_id: string
          coach_id: string
          focus: string
          goal: string
          notes: string
          target_weight: number | null
          updated_at: string
        }
        Insert: {
          client_id: string
          coach_id: string
          focus?: string
          goal?: string
          notes?: string
          target_weight?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          focus?: string
          goal?: string
          notes?: string
          target_weight?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_goals_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      clients: {
        Row: {
          archived: boolean
          archived_at: string | null
          archived_reason: string | null
          coach_id: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          trainee_user_id: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          archived_reason?: string | null
          coach_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string
          trainee_user_id?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          archived_reason?: string | null
          coach_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          trainee_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_branding: {
        Row: {
          avatar_base64: string | null
          avatar_id: string | null
          coach_id: string
          display_name: string
          updated_at: string
        }
        Insert: {
          avatar_base64?: string | null
          avatar_id?: string | null
          coach_id: string
          display_name?: string
          updated_at?: string
        }
        Update: {
          avatar_base64?: string | null
          avatar_id?: string | null
          coach_id?: string
          display_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_branding_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_records: {
        Row: {
          author_id: string | null
          author_type: string
          client_id: string
          coach_feedback: string
          coach_id: string
          created_at: string
          entry_date: string
          id: string
          kind: string
          modified_by_type: string | null
          payload: Json
          read_at: string | null
          reviewed_at: string | null
          revision: number
          source_key: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_type?: string
          client_id: string
          coach_feedback?: string
          coach_id: string
          created_at?: string
          entry_date: string
          id: string
          kind: string
          modified_by_type?: string | null
          payload: Json
          read_at?: string | null
          reviewed_at?: string | null
          revision?: number
          source_key: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_type?: string
          client_id?: string
          coach_feedback?: string
          coach_id?: string
          created_at?: string
          entry_date?: string
          id?: string
          kind?: string
          modified_by_type?: string | null
          payload?: Json
          read_at?: string | null
          reviewed_at?: string | null
          revision?: number
          source_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_records_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_records_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      ec_accounts: {
        Row: {
          billing_plan: string
          cancel_at_period_end: boolean
          created_at: string
          discount_qualified: boolean
          locked_price_halalas: number | null
          locked_tax_bps: number | null
          locked_tax_mode: string | null
          locked_total_halalas: number | null
          mode: string
          owner_id: string
          payment_method_ref: string | null
          period_end: string | null
          period_start: string | null
          portal_color: string | null
          provider_canceled_at: string | null
          quota_revision: number
          recurring_ref: string | null
          selected_clients: string[] | null
          selected_templates: string[] | null
          status: string
          trial_end: string | null
          trial_start: string | null
          trial_used_at: string | null
        }
        Insert: {
          billing_plan?: string
          cancel_at_period_end?: boolean
          created_at?: string
          discount_qualified?: boolean
          locked_price_halalas?: number | null
          locked_tax_bps?: number | null
          locked_tax_mode?: string | null
          locked_total_halalas?: number | null
          mode?: string
          owner_id: string
          payment_method_ref?: string | null
          period_end?: string | null
          period_start?: string | null
          portal_color?: string | null
          provider_canceled_at?: string | null
          quota_revision?: number
          recurring_ref?: string | null
          selected_clients?: string[] | null
          selected_templates?: string[] | null
          status?: string
          trial_end?: string | null
          trial_start?: string | null
          trial_used_at?: string | null
        }
        Update: {
          billing_plan?: string
          cancel_at_period_end?: boolean
          created_at?: string
          discount_qualified?: boolean
          locked_price_halalas?: number | null
          locked_tax_bps?: number | null
          locked_tax_mode?: string | null
          locked_total_halalas?: number | null
          mode?: string
          owner_id?: string
          payment_method_ref?: string | null
          period_end?: string | null
          period_start?: string | null
          portal_color?: string | null
          provider_canceled_at?: string | null
          quota_revision?: number
          recurring_ref?: string | null
          selected_clients?: string[] | null
          selected_templates?: string[] | null
          status?: string
          trial_end?: string | null
          trial_start?: string | null
          trial_used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_accounts_billing_plan_fkey"
            columns: ["billing_plan"]
            isOneToOne: false
            referencedRelation: "ec_plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ec_accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_assignments: {
        Row: {
          branch_id: string | null
          client_id: string
          member_id: string | null
          owner_id: string
        }
        Insert: {
          branch_id?: string | null
          client_id: string
          member_id?: string | null
          owner_id: string
        }
        Update: {
          branch_id?: string | null
          client_id?: string
          member_id?: string | null
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_assignments_branch_id_owner_id_fkey"
            columns: ["branch_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "ec_branches"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "ec_assignments_client_id_owner_id_fkey"
            columns: ["client_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
          {
            foreignKeyName: "ec_assignments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "ec_accounts"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "ec_assignments_owner_id_member_id_fkey"
            columns: ["owner_id", "member_id"]
            isOneToOne: false
            referencedRelation: "ec_team"
            referencedColumns: ["owner_id", "member_id"]
          },
        ]
      }
      ec_branches: {
        Row: {
          active: boolean
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          active?: boolean
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_branches_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "ec_accounts"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      ec_bulk_previews: {
        Row: {
          actor_id: string
          applied_at: string | null
          body: Json
          created_at: string
          expires_at: string
          id: string
          operation: string
          owner_id: string
        }
        Insert: {
          actor_id: string
          applied_at?: string | null
          body: Json
          created_at?: string
          expires_at?: string
          id?: string
          operation: string
          owner_id: string
        }
        Update: {
          actor_id?: string
          applied_at?: string | null
          body?: Json
          created_at?: string
          expires_at?: string
          id?: string
          operation?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_bulk_previews_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "ec_accounts"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      ec_config: {
        Row: {
          discount_enabled: boolean
          discount_end: string | null
          discount_start: string | null
          provider_verified: boolean
          reference_prices_approved: boolean
          singleton: boolean
          tax_bps: number | null
          tax_mode: string
          trial_enabled: boolean
          trial_end: string | null
          trial_start: string | null
        }
        Insert: {
          discount_enabled?: boolean
          discount_end?: string | null
          discount_start?: string | null
          provider_verified?: boolean
          reference_prices_approved?: boolean
          singleton?: boolean
          tax_bps?: number | null
          tax_mode?: string
          trial_enabled?: boolean
          trial_end?: string | null
          trial_start?: string | null
        }
        Update: {
          discount_enabled?: boolean
          discount_end?: string | null
          discount_start?: string | null
          provider_verified?: boolean
          reference_prices_approved?: boolean
          singleton?: boolean
          tax_bps?: number | null
          tax_mode?: string
          trial_enabled?: boolean
          trial_end?: string | null
          trial_start?: string | null
        }
        Relationships: []
      }
      ec_consents: {
        Row: {
          accepted_at: string
          consumed_at: string | null
          expires_at: string
          id: string
          owner_id: string
          plan: string
          quote: Json
          terms_version: string
        }
        Insert: {
          accepted_at?: string
          consumed_at?: string | null
          expires_at?: string
          id?: string
          owner_id: string
          plan: string
          quote: Json
          terms_version?: string
        }
        Update: {
          accepted_at?: string
          consumed_at?: string | null
          expires_at?: string
          id?: string
          owner_id?: string
          plan?: string
          quote?: Json
          terms_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_consents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "ec_accounts"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "ec_consents_plan_fkey"
            columns: ["plan"]
            isOneToOne: false
            referencedRelation: "ec_plans"
            referencedColumns: ["code"]
          },
        ]
      }
      ec_email_outbox: {
        Row: {
          created_at: string
          id: string
          kind: string
          owner_id: string
          payload: Json
          period_ref: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          owner_id: string
          payload: Json
          period_ref: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          owner_id?: string
          payload?: Json
          period_ref?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_email_outbox_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "ec_accounts"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      ec_events: {
        Row: {
          invoice_id: string | null
          outcome: string
          provider_event: string
          received_at: string
        }
        Insert: {
          invoice_id?: string | null
          outcome: string
          provider_event: string
          received_at?: string
        }
        Update: {
          invoice_id?: string | null
          outcome?: string
          provider_event?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "ec_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_invoices: {
        Row: {
          amount_halalas: number
          created_at: string
          currency: string
          cycle_end: string
          cycle_start: string
          id: string
          owner_id: string
          paid_at: string | null
          plan: string
          provider_order: string
          review_reason: string | null
          status: string
          transaction_ref: string | null
        }
        Insert: {
          amount_halalas: number
          created_at?: string
          currency?: string
          cycle_end: string
          cycle_start: string
          id?: string
          owner_id: string
          paid_at?: string | null
          plan: string
          provider_order: string
          review_reason?: string | null
          status?: string
          transaction_ref?: string | null
        }
        Update: {
          amount_halalas?: number
          created_at?: string
          currency?: string
          cycle_end?: string
          cycle_start?: string
          id?: string
          owner_id?: string
          paid_at?: string | null
          plan?: string
          provider_order?: string
          review_reason?: string | null
          status?: string
          transaction_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_invoices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "ec_accounts"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "ec_invoices_plan_fkey"
            columns: ["plan"]
            isOneToOne: false
            referencedRelation: "ec_plans"
            referencedColumns: ["code"]
          },
        ]
      }
      ec_plans: {
        Row: {
          client_limit: number | null
          coach_limit: number
          code: string
          features: string[]
          name_ar: string
          price_halalas: number
          template_limit: number | null
        }
        Insert: {
          client_limit?: number | null
          coach_limit: number
          code: string
          features: string[]
          name_ar: string
          price_halalas: number
          template_limit?: number | null
        }
        Update: {
          client_limit?: number | null
          coach_limit?: number
          code?: string
          features?: string[]
          name_ar?: string
          price_halalas?: number
          template_limit?: number | null
        }
        Relationships: []
      }
      ec_report_schedules: {
        Row: {
          enabled: boolean
          interval_days: number
          next_run: string
          owner_id: string
        }
        Insert: {
          enabled?: boolean
          interval_days: number
          next_run: string
          owner_id: string
        }
        Update: {
          enabled?: boolean
          interval_days?: number
          next_run?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_report_schedules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "ec_accounts"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      ec_rules: {
        Row: {
          action: string
          created_at: string
          enabled: boolean
          event: string
          id: string
          next_client: string | null
          owner_id: string
          threshold: number
        }
        Insert: {
          action: string
          created_at?: string
          enabled?: boolean
          event: string
          id?: string
          next_client?: string | null
          owner_id: string
          threshold: number
        }
        Update: {
          action?: string
          created_at?: string
          enabled?: boolean
          event?: string
          id?: string
          next_client?: string | null
          owner_id?: string
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "ec_rules_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "ec_accounts"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      ec_tasks: {
        Row: {
          assignee_id: string
          client_id: string
          created_at: string
          due_at: string
          id: string
          owner_id: string
          source: string
          status: string
          title: string
        }
        Insert: {
          assignee_id: string
          client_id: string
          created_at?: string
          due_at: string
          id?: string
          owner_id: string
          source?: string
          status?: string
          title: string
        }
        Update: {
          assignee_id?: string
          client_id?: string
          created_at?: string
          due_at?: string
          id?: string
          owner_id?: string
          source?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_tasks_client_id_owner_id_fkey"
            columns: ["client_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
          {
            foreignKeyName: "ec_tasks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "ec_accounts"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      ec_team: {
        Row: {
          accepted_at: string | null
          active: boolean
          branch_id: string | null
          created_at: string
          member_id: string
          owner_id: string
          role: string
        }
        Insert: {
          accepted_at?: string | null
          active?: boolean
          branch_id?: string | null
          created_at?: string
          member_id: string
          owner_id: string
          role: string
        }
        Update: {
          accepted_at?: string | null
          active?: boolean
          branch_id?: string | null
          created_at?: string
          member_id?: string
          owner_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_team_branch_id_owner_id_fkey"
            columns: ["branch_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "ec_branches"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "ec_team_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_team_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "ec_accounts"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      ec_team_audit: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          entity_id: string | null
          id: number
          owner_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          entity_id?: string | null
          id?: never
          owner_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          entity_id?: string | null
          id?: never
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_team_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_team_audit_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "ec_accounts"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      exercises: {
        Row: {
          coach_id: string
          created_at: string | null
          description: string
          id: string
          media_id: string | null
          name: string
          video: string
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          description?: string
          id?: string
          media_id?: string | null
          name: string
          video?: string
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          description?: string
          id?: string
          media_id?: string | null
          name?: string
          video?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercises_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      freezes: {
        Row: {
          applied_at: string
          coach_id: string
          days: number
          end_date: string
          id: string
          start_date: string
          subscription_id: string
        }
        Insert: {
          applied_at?: string
          coach_id: string
          days: number
          end_date: string
          id: string
          start_date: string
          subscription_id: string
        }
        Update: {
          applied_at?: string
          coach_id?: string
          days?: number
          end_date?: string
          id?: string
          start_date?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "freezes_subscription_id_coach_id_fkey"
            columns: ["subscription_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      import_batches: {
        Row: {
          changes: Json
          coach_id: string
          created_at: string
          fingerprint: string
          id: string
          report: Json
          status: string
        }
        Insert: {
          changes: Json
          coach_id: string
          created_at?: string
          fingerprint: string
          id: string
          report: Json
          status?: string
        }
        Update: {
          changes?: Json
          coach_id?: string
          created_at?: string
          fingerprint?: string
          id?: string
          report?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_subscription_refs: {
        Row: {
          client_id: string
          coach_id: string
          source_ref: string
          subscription_id: string
        }
        Insert: {
          client_id: string
          coach_id: string
          source_ref: string
          subscription_id: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          source_ref?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_subscription_refs_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
          {
            foreignKeyName: "import_subscription_refs_subscription_id_coach_id_fkey"
            columns: ["subscription_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      invitations: {
        Row: {
          client_id: string
          coach_id: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          client_id: string
          coach_id: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      join_links: {
        Row: {
          coach_id: string
          created_at: string | null
          expires_at: string
          id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_links_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          coach_id: string
          created_at: string | null
          email: string
          id: string
          name: string
          phone: string
          status: string
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          email: string
          id?: string
          name: string
          phone?: string
          status?: string
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          phone?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          coach_id: string
          created_at: string
          filename: string
          id: string
          mime: string
          path: string
          size: number
          status: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          filename: string
          id: string
          mime: string
          path: string
          size: number
          status?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          filename?: string
          id?: string
          mime?: string
          path?: string
          size?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paylink_invoices: {
        Row: {
          amount: number
          client_id: string
          coach_id: string
          created_at: string
          expires_at: string
          id: string
          order_number: string
          payment_errors: Json
          payment_id: string | null
          payment_type: string | null
          payment_url: string | null
          review_reason: string | null
          settled_at: string | null
          status: string
          subscription_id: string
          transaction_no: string | null
        }
        Insert: {
          amount: number
          client_id: string
          coach_id: string
          created_at?: string
          expires_at?: string
          id?: string
          order_number: string
          payment_errors?: Json
          payment_id?: string | null
          payment_type?: string | null
          payment_url?: string | null
          review_reason?: string | null
          settled_at?: string | null
          status?: string
          subscription_id: string
          transaction_no?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          coach_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          order_number?: string
          payment_errors?: Json
          payment_id?: string | null
          payment_type?: string | null
          payment_url?: string | null
          review_reason?: string | null
          settled_at?: string | null
          status?: string
          subscription_id?: string
          transaction_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paylink_invoices_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
          {
            foreignKeyName: "paylink_invoices_subscription_id_coach_id_fkey"
            columns: ["subscription_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          coach_id: string
          created_at: string
          id: string
          kind: string
          method: string
          paid_date: string
          reason: string
          reference: string
          reverses: string | null
          subscription_id: string
        }
        Insert: {
          amount: number
          coach_id: string
          created_at?: string
          id: string
          kind: string
          method: string
          paid_date: string
          reason?: string
          reference?: string
          reverses?: string | null
          subscription_id: string
        }
        Update: {
          amount?: number
          coach_id?: string
          created_at?: string
          id?: string
          kind?: string
          method?: string
          paid_date?: string
          reason?: string
          reference?: string
          reverses?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_reverses_coach_id_fkey"
            columns: ["reverses", "coach_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id", "coach_id"]
          },
          {
            foreignKeyName: "payments_subscription_id_coach_id_fkey"
            columns: ["subscription_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      portal_links: {
        Row: {
          access_mode: string
          attempt_window: string
          attempts: number
          client_id: string
          coach_id: string
          expires_at: string
          id: string
          last_opened_at: string | null
          proof_hash: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          access_mode?: string
          attempt_window?: string
          attempts?: number
          client_id: string
          coach_id: string
          expires_at?: string
          id?: string
          last_opened_at?: string | null
          proof_hash: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          access_mode?: string
          attempt_window?: string
          attempts?: number
          client_id?: string
          coach_id?: string
          expires_at?: string
          id?: string
          last_opened_at?: string | null
          proof_hash?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_links_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      privacy_requests: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string | null
          details: string
          id: string
          kind: string
          resolution: string
          status: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string | null
          details: string
          id?: string
          kind: string
          resolution?: string
          status?: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string | null
          details?: string
          id?: string
          kind?: string
          resolution?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_requests_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          role: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          client_id: string
          coach_id: string
          content: Json
          created_at: string
          edit_revision: number
          id: string
          name: string
          publication_number: number | null
          published_at: string | null
          version: number
        }
        Insert: {
          client_id: string
          coach_id: string
          content: Json
          created_at?: string
          edit_revision?: number
          id?: string
          name: string
          publication_number?: number | null
          published_at?: string | null
          version?: never
        }
        Update: {
          client_id?: string
          coach_id?: string
          content?: Json
          created_at?: string
          edit_revision?: number
          id?: string
          name?: string
          publication_number?: number | null
          published_at?: string | null
          version?: never
        }
        Relationships: [
          {
            foreignKeyName: "programs_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      progress_photos: {
        Row: {
          angle: string
          author_id: string | null
          client_id: string
          coach_id: string
          consent_source: string | null
          consented_at: string | null
          created_at: string
          entry_date: string
          filename: string
          id: string
          mime: string
          size: number
          status: string
        }
        Insert: {
          angle?: string
          author_id?: string | null
          client_id: string
          coach_id: string
          consent_source?: string | null
          consented_at?: string | null
          created_at?: string
          entry_date: string
          filename: string
          id: string
          mime: string
          size: number
          status?: string
        }
        Update: {
          angle?: string
          author_id?: string | null
          client_id?: string
          coach_id?: string
          consent_source?: string | null
          consented_at?: string | null
          created_at?: string
          entry_date?: string
          filename?: string
          id?: string
          mime?: string
          size?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_photos_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_photos_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      session_attendance: {
        Row: {
          attended_on: string
          client_id: string
          coach_id: string
          created_at: string
          id: string
          subscription_id: string
        }
        Insert: {
          attended_on: string
          client_id: string
          coach_id: string
          created_at?: string
          id: string
          subscription_id: string
        }
        Update: {
          attended_on?: string
          client_id?: string
          coach_id?: string
          created_at?: string
          id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_attendance_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
          {
            foreignKeyName: "session_attendance_subscription_id_coach_id_fkey"
            columns: ["subscription_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          client_id: string
          coach_id: string
          created_at: string
          end_date: string
          id: string
          name: string
          previous_id: string | null
          price: number
          session_limit: number | null
          start_date: string
        }
        Insert: {
          client_id: string
          coach_id: string
          created_at?: string
          end_date: string
          id?: string
          name: string
          previous_id?: string | null
          price: number
          session_limit?: number | null
          start_date: string
        }
        Update: {
          client_id?: string
          coach_id?: string
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          previous_id?: string | null
          price?: number
          session_limit?: number | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
          {
            foreignKeyName: "subscriptions_previous_id_coach_id_fkey"
            columns: ["previous_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          attachment_path: string | null
          author_id: string
          created_at: string
          description: string
          id: string
          kind: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attachment_path?: string | null
          author_id: string
          created_at?: string
          description: string
          id?: string
          kind: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attachment_path?: string | null
          author_id?: string
          created_at?: string
          description?: string
          id?: string
          kind?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      template_metadata: {
        Row: {
          archived: boolean
          coach_id: string
          days_per_week: number | null
          description: string
          goal: string | null
          import_key: string | null
          kind: string
          last_used_at: string | null
          level: string | null
          template_id: string
        }
        Insert: {
          archived?: boolean
          coach_id: string
          days_per_week?: number | null
          description?: string
          goal?: string | null
          import_key?: string | null
          kind?: string
          last_used_at?: string | null
          level?: string | null
          template_id: string
        }
        Update: {
          archived?: boolean
          coach_id?: string
          days_per_week?: number | null
          description?: string
          goal?: string | null
          import_key?: string | null
          kind?: string
          last_used_at?: string | null
          level?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_metadata_template_id_coach_id_fkey"
            columns: ["template_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
      templates: {
        Row: {
          coach_id: string
          content: Json
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          coach_id: string
          content: Json
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          coach_id?: string
          content?: Json
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_sessions: {
        Row: {
          asset_id: string | null
          coach_id: string
          created_at: string
          expires_at: string
          filename: string | null
          mime: string | null
          size: number | null
          token_hash: string
        }
        Insert: {
          asset_id?: string | null
          coach_id: string
          created_at?: string
          expires_at?: string
          filename?: string | null
          mime?: string | null
          size?: number | null
          token_hash: string
        }
        Update: {
          asset_id?: string | null
          coach_id?: string
          created_at?: string
          expires_at?: string
          filename?: string | null
          mime?: string | null
          size?: number | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_sessions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_entries: {
        Row: {
          client_id: string
          coach_id: string
          entry_date: string
          id: string
          updated_at: string
          weight: number
        }
        Insert: {
          client_id: string
          coach_id: string
          entry_date: string
          id?: string
          updated_at?: string
          weight: number
        }
        Update: {
          client_id?: string
          coach_id?: string
          entry_date?: string
          id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_entries_client_id_coach_id_fkey"
            columns: ["client_id", "coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "coach_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      app_command: { Args: { command: string; payload: Json }; Returns: Json }
      app_snapshot: { Args: never; Returns: Json }
      bearer_portal_create: {
        Args: { client_id: string; proof_hash: string; token_hash: string }
        Returns: Json
      }
      bearer_portal_exchange: {
        Args: {
          portal_id: string
          proof: string
          session_hash: string
          token_hash: string
        }
        Returns: boolean
      }
      claim_invite: { Args: { token: string }; Returns: boolean }
      client_purge: {
        Args: { confirm_name: string; target: string }
        Returns: Json
      }
      client_purge_summary: { Args: { target: string }; Returns: Json }
      client_schedule_save: { Args: { payload: Json }; Returns: Json }
      client_schedules_snapshot: { Args: never; Returns: Json }
      coach_branding_avatar: { Args: { asset: string }; Returns: string }
      coach_branding_link: {
        Args: { link_type: string; token_hash: string }
        Returns: Json
      }
      coach_branding_save: {
        Args: {
          avatar_data: string
          change_avatar: boolean
          display_name: string
          expected_version?: string
        }
        Returns: Json
      }
      coach_branding_snapshot: { Args: never; Returns: Json }
      current_coach_identity: { Args: never; Returns: Json }
      ec_advanced_report: { Args: { owner: string }; Returns: Json }
      ec_assign_client: {
        Args: { branch?: string; client: string; member: string }
        Returns: boolean
      }
      ec_attendance: {
        Args: {
          attendance_date: string
          attendance_id: string
          subscription: string
        }
        Returns: boolean
      }
      ec_attendance_page: { Args: { client: string }; Returns: Json }
      ec_attendance_roster: { Args: { after_client?: string }; Returns: Json }
      ec_branch_save: {
        Args: { branch: string; branch_name: string; enabled?: boolean }
        Returns: string
      }
      ec_brand_color: { Args: { color: string }; Returns: boolean }
      ec_bulk_apply: { Args: { preview: string }; Returns: boolean }
      ec_bulk_preview: {
        Args: { body: Json; operation: string }
        Returns: Json
      }
      ec_client_color: { Args: { client: string }; Returns: string }
      ec_client_features: { Args: { client: string }; Returns: string[] }
      ec_coach_comparison: { Args: { owner: string }; Returns: Json }
      ec_comparison: {
        Args: { after_branch?: string; owner: string }
        Returns: Json
      }
      ec_confirm_cancel: {
        Args: { owner: string; provider_reference: string }
        Returns: boolean
      }
      ec_confirm_setup: {
        Args: {
          consent_id: string
          method_reference: string
          provider_reference: string
        }
        Returns: boolean
      }
      ec_invoice_page: {
        Args: { before_date?: string; before_id?: string }
        Returns: Json
      }
      ec_org_page: {
        Args: {
          after_client?: string
          branch?: string
          member?: string
          owner: string
        }
        Returns: Json
      }
      ec_queue_package_expiry: { Args: never; Returns: number }
      ec_queue_reports: { Args: never; Returns: number }
      ec_quote: { Args: { plan_code: string }; Returns: Json }
      ec_reconcile: { Args: never; Returns: Json }
      ec_record_payment: {
        Args: {
          amount: number
          currency_code: string
          event_ref: string
          invoice: string
          paid: boolean
          transaction: string
        }
        Returns: string
      }
      ec_report: {
        Args: { branch?: string; member?: string; owner: string }
        Returns: Json
      }
      ec_require: { Args: { feature: string }; Returns: boolean }
      ec_resource_options: {
        Args: { after_client?: string; after_template?: string }
        Returns: Json
      }
      ec_rule_save: {
        Args: {
          action_name: string
          enabled: boolean
          event_name: string
          rule: string
          threshold_value: number
        }
        Returns: boolean
      }
      ec_run_automation: { Args: never; Returns: number }
      ec_schedule_report: {
        Args: { enabled: boolean; every_days: number; first_run: string }
        Returns: boolean
      }
      ec_select_resources: {
        Args: { clients: string[]; templates: string[] }
        Returns: boolean
      }
      ec_session_limit: {
        Args: { sessions: number; subscription: string }
        Returns: boolean
      }
      ec_subscription: { Args: never; Returns: Json }
      ec_task_page: {
        Args: {
          after_due?: string
          after_id?: string
          owner: string
          task_status?: string
        }
        Returns: Json
      }
      ec_task_save: {
        Args: {
          assignee: string
          client: string
          done?: boolean
          due: string
          owner: string
          task?: string
          title: string
        }
        Returns: boolean
      }
      ec_team_accept: { Args: { owner: string }; Returns: boolean }
      ec_team_deactivate: { Args: { member: string }; Returns: boolean }
      ec_team_homes: { Args: never; Returns: Json }
      ec_team_invite: {
        Args: { branch?: string; email_address: string; member_role: string }
        Returns: boolean
      }
      ec_team_options: { Args: never; Returns: Json }
      ec_team_program_context: {
        Args: { owner: string; target: string }
        Returns: Json
      }
      ec_team_program_publish: {
        Args: { expected_revision: number; owner: string; program: string }
        Returns: Json
      }
      ec_team_program_save: {
        Args: {
          body: Json
          expected_id: string
          expected_revision: number
          owner: string
          program_name: string
          target: string
        }
        Returns: Json
      }
      ec_workspace_page: {
        Args: {
          after_client?: string
          after_exercise?: string
          after_template?: string
          search_text?: string
          target?: string
        }
        Returns: Json
      }
      finalize_photo: { Args: { asset: string }; Returns: boolean }
      init_profile: {
        Args: { display_name: string; requested_role: string }
        Returns: Json
      }
      management_command: {
        Args: { command: string; payload: Json }
        Returns: Json
      }
      management_snapshot: { Args: never; Returns: Json }
      media_access: {
        Args: { asset: string; portal_hash?: string; proof?: string }
        Returns: Json
      }
      paylink_account_get: { Args: { coach: string }; Returns: string }
      paylink_account_put: {
        Args: { coach: string; sealed: string }
        Returns: boolean
      }
      paylink_checkout_context: {
        Args: { subscription: string; trainee: string }
        Returns: Json
      }
      paylink_invoice_abandon: { Args: { order_no: string }; Returns: boolean }
      paylink_invoice_attach: {
        Args: { order_no: string; transaction: string; url: string }
        Returns: boolean
      }
      paylink_invoice_lookup: {
        Args: { order_no: string; transaction: string }
        Returns: Json
      }
      paylink_invoice_mark: {
        Args: { errors: Json; next_status: string; transaction: string }
        Returns: boolean
      }
      paylink_invoice_open: {
        Args: {
          client: string
          coach: string
          order_no: string
          subscription: string
          total: number
        }
        Returns: string
      }
      paylink_invoice_reserve: {
        Args: {
          client: string
          coach: string
          order_no: string
          subscription: string
          total: number
        }
        Returns: string
      }
      paylink_invoice_settle: {
        Args: { method_type: string; paid_amount: number; transaction: string }
        Returns: Json
      }
      paylink_ready_coaches: { Args: { coaches: string[] }; Returns: string[] }
      photo_access: {
        Args: { asset: string; portal_hash?: string; proof?: string }
        Returns: Json
      }
      photo_cleanup: { Args: { completed?: Json }; Returns: Json }
      photo_cleanup_authorized: {
        Args: { asset: string; portal_hash?: string; proof?: string }
        Returns: Json
      }
      photo_cleanup_batch: {
        Args: { completed?: Json; prune_abandoned?: boolean }
        Returns: Json
      }
      photo_consent: {
        Args: {
          command: string
          delete_photos?: boolean
          notice_version?: number
          portal_hash?: string
          proof?: string
          target: string
        }
        Returns: Json
      }
      photo_consent_snapshot: { Args: never; Returns: Json }
      portal_access: {
        Args: {
          day?: string
          proof: string
          remove?: boolean
          token_hash: string
          value?: number
        }
        Returns: Json
      }
      portal_account_invite: {
        Args: { invitation_hash: string; proof: string; token_hash: string }
        Returns: Json
      }
      portal_exchange_rate_limit: {
        Args: { key_hash: string }
        Returns: number
      }
      portal_management: {
        Args: {
          command: string
          payload?: Json
          proof: string
          token_hash: string
        }
        Returns: Json
      }
      portal_photo_consent: {
        Args: { proof: string; token_hash: string }
        Returns: Json
      }
      portal_schedule_snapshot: {
        Args: { proof: string; token_hash: string }
        Returns: Json
      }
      portal_session_context: {
        Args: { portal_id: string; session_hash: string }
        Returns: Json
      }
      portal_transport_info: { Args: { token_hash: string }; Returns: Json }
      profile_update: { Args: { display_name: string }; Returns: boolean }
      progress_record_change: {
        Args: {
          command: string
          entry_date?: string
          expected_updated_at: string
          portal_hash?: string
          proof?: string
          record_id: string
          target_client: string
          value?: Json
        }
        Returns: Json
      }
      public_link_info: {
        Args: { link_type: string; token: string }
        Returns: Json
      }
      public_portal_branding: { Args: { portal_id: string }; Returns: Json }
      request_join: {
        Args: {
          contact_email: string
          contact_phone: string
          display_name: string
          token: string
        }
        Returns: boolean
      }
      studio_snapshot: { Args: never; Returns: Json }
      support_ticket_create: {
        Args: {
          p_attachment_path?: string
          p_description: string
          p_kind: string
          p_title: string
        }
        Returns: Json
      }
      support_ticket_list: { Args: never; Returns: Json }
      trainee_access_status: { Args: never; Returns: Json }
      upload_access: {
        Args: { payload?: Json; token_hash: string }
        Returns: Json
      }
      valid_content: { Args: { body: Json }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
