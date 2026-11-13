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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
          coach_id: string
          created_at: string
          detail: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id: string
          coach_id: string
          created_at?: string
          detail?: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string
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
      exercises: {
        Row: {
          coach_id: string
          created_at: string | null
          description: string
          id: string
          name: string
          video: string
        }
        Insert: {
          coach_id: string
          created_at?: string | null
          description?: string
          id?: string
          name: string
          video?: string
        }
        Update: {
          coach_id?: string
          created_at?: string | null
          description?: string
          id?: string
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
