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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage_windows: {
        Row: {
          family_id: string
          profile_id: string
          request_count: number
          updated_at: string
          usage_date: string
        }
        Insert: {
          family_id: string
          profile_id: string
          request_count?: number
          updated_at?: string
          usage_date: string
        }
        Update: {
          family_id?: string
          profile_id?: string
          request_count?: number
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_windows_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_windows_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_plans: {
        Row: {
          child_profile_id: string
          created_at: string
          family_id: string
          id: string
          input_summary: string | null
          model_name: string
          output_json: Json
          plan_type: string
          session_id: string | null
          status: string
        }
        Insert: {
          child_profile_id: string
          created_at?: string
          family_id: string
          id?: string
          input_summary?: string | null
          model_name: string
          output_json?: Json
          plan_type: string
          session_id?: string | null
          status?: string
        }
        Update: {
          child_profile_id?: string
          created_at?: string
          family_id?: string
          id?: string
          input_summary?: string | null
          model_name?: string
          output_json?: Json
          plan_type?: string
          session_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_plans_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_plans_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_plans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "learning_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          approved_by: string | null
          created_at: string
          decision: string
          family_id: string
          id: string
          reason: string | null
          requested_by: string
          reviewed_at: string | null
          session_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          decision?: string
          family_id: string
          id?: string
          reason?: string | null
          requested_by: string
          reviewed_at?: string | null
          session_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          decision?: string
          family_id?: string
          id?: string
          reason?: string | null
          requested_by?: string
          reviewed_at?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "learning_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      child_milestones: {
        Row: {
          child_profile_id: string
          created_at: string
          created_by: string
          description: string | null
          family_id: string
          id: string
          redeemed_at: string | null
          starting_points: number
          status: string
          target_points: number
          title: string
          unlocked_at: string | null
          updated_at: string
        }
        Insert: {
          child_profile_id: string
          created_at?: string
          created_by: string
          description?: string | null
          family_id: string
          id?: string
          redeemed_at?: string | null
          starting_points?: number
          status?: string
          target_points: number
          title: string
          unlocked_at?: string | null
          updated_at?: string
        }
        Update: {
          child_profile_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          family_id?: string
          id?: string
          redeemed_at?: string | null
          starting_points?: number
          status?: string
          target_points?: number
          title?: string
          unlocked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_milestones_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_milestones_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      exceptions: {
        Row: {
          child_profile_id: string
          created_at: string
          description: string
          family_id: string
          id: string
          recommended_action: string
          resolved_at: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          child_profile_id: string
          created_at?: string
          description: string
          family_id: string
          id?: string
          recommended_action: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
        }
        Update: {
          child_profile_id?: string
          created_at?: string
          description?: string
          family_id?: string
          id?: string
          recommended_action?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "exceptions_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exceptions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      family_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          family_id: string
          id: string
          invited_by: string
          role: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          family_id: string
          id?: string
          invited_by: string
          role: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          family_id?: string
          id?: string
          invited_by?: string
          role?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_invites_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          family_id: string
          id: string
          joined_at: string
          profile_id: string
          role: string
          status: string
        }
        Insert: {
          family_id: string
          id?: string
          joined_at?: string
          profile_id: string
          role: string
          status?: string
        }
        Update: {
          family_id?: string
          id?: string
          joined_at?: string
          profile_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_settings: {
        Row: {
          ai_daily_plan_limit: number
          break_duration_minutes: number
          created_at: string
          default_approval_mode: string
          family_id: string
          id: string
          max_breaks_per_session: number
          screen_time_limit_minutes: number
          study_lock_enabled: boolean
          timezone: string
          updated_at: string
          xp_level_size: number
          xp_per_completed_task: number
          xp_per_correct_answer: number
          xp_per_minute: number
        }
        Insert: {
          ai_daily_plan_limit?: number
          break_duration_minutes?: number
          created_at?: string
          default_approval_mode?: string
          family_id: string
          id?: string
          max_breaks_per_session?: number
          screen_time_limit_minutes?: number
          study_lock_enabled?: boolean
          timezone?: string
          updated_at?: string
          xp_level_size?: number
          xp_per_completed_task?: number
          xp_per_correct_answer?: number
          xp_per_minute?: number
        }
        Update: {
          ai_daily_plan_limit?: number
          break_duration_minutes?: number
          created_at?: string
          default_approval_mode?: string
          family_id?: string
          id?: string
          max_breaks_per_session?: number
          screen_time_limit_minutes?: number
          study_lock_enabled?: boolean
          timezone?: string
          updated_at?: string
          xp_level_size?: number
          xp_per_completed_task?: number
          xp_per_correct_answer?: number
          xp_per_minute?: number
        }
        Relationships: [
          {
            foreignKeyName: "family_settings_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: true
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_goals: {
        Row: {
          child_profile_id: string
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          family_id: string
          id: string
          status: string
          subject: string
          target_minutes: number
          title: string
          updated_at: string
        }
        Insert: {
          child_profile_id: string
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          family_id: string
          id?: string
          status?: string
          subject: string
          target_minutes?: number
          title: string
          updated_at?: string
        }
        Update: {
          child_profile_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          family_id?: string
          id?: string
          status?: string
          subject?: string
          target_minutes?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_goals_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_goals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_sessions: {
        Row: {
          actual_started_at: string | null
          approval_policy: string
          awarded_points: number
          child_note: string | null
          child_profile_id: string
          created_at: string
          duration_minutes: number | null
          ends_at: string | null
          evidence_url: string | null
          family_id: string
          focus_score: number | null
          goal_id: string | null
          id: string
          notes: string | null
          quick_check_score: number | null
          quick_check_total: number | null
          reflection: string | null
          schedule_event_id: string | null
          schedule_occurrence_id: string | null
          starts_at: string
          status: string
          subject: string
          tasks_done: number
          tasks_total: number
          title: string
          updated_at: string
        }
        Insert: {
          actual_started_at?: string | null
          approval_policy?: string
          awarded_points?: number
          child_note?: string | null
          child_profile_id: string
          created_at?: string
          duration_minutes?: number | null
          ends_at?: string | null
          evidence_url?: string | null
          family_id: string
          focus_score?: number | null
          goal_id?: string | null
          id?: string
          notes?: string | null
          quick_check_score?: number | null
          quick_check_total?: number | null
          reflection?: string | null
          schedule_event_id?: string | null
          schedule_occurrence_id?: string | null
          starts_at: string
          status?: string
          subject: string
          tasks_done?: number
          tasks_total?: number
          title: string
          updated_at?: string
        }
        Update: {
          actual_started_at?: string | null
          approval_policy?: string
          awarded_points?: number
          child_note?: string | null
          child_profile_id?: string
          created_at?: string
          duration_minutes?: number | null
          ends_at?: string | null
          evidence_url?: string | null
          family_id?: string
          focus_score?: number | null
          goal_id?: string | null
          id?: string
          notes?: string | null
          quick_check_score?: number | null
          quick_check_total?: number | null
          reflection?: string | null
          schedule_event_id?: string | null
          schedule_occurrence_id?: string | null
          starts_at?: string
          status?: string
          subject?: string
          tasks_done?: number
          tasks_total?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_sessions_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_sessions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_sessions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "learning_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_sessions_schedule_event_id_fkey"
            columns: ["schedule_event_id"]
            isOneToOne: false
            referencedRelation: "schedule_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_sessions_schedule_occurrence_id_fkey"
            columns: ["schedule_occurrence_id"]
            isOneToOne: true
            referencedRelation: "schedule_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      managed_devices: {
        Row: {
          child_profile_id: string
          created_at: string
          created_by: string
          display_name: string
          family_id: string
          id: string
          last_seen_at: string | null
          paired_at: string | null
          pairing_code_hash: string | null
          pairing_expires_at: string | null
          platform: string
          policy: Json
          policy_version: number
          revoked_at: string | null
          status: string
          token_hash: string | null
          updated_at: string
        }
        Insert: {
          child_profile_id: string
          created_at?: string
          created_by: string
          display_name: string
          family_id: string
          id?: string
          last_seen_at?: string | null
          paired_at?: string | null
          pairing_code_hash?: string | null
          pairing_expires_at?: string | null
          platform: string
          policy?: Json
          policy_version?: number
          revoked_at?: string | null
          status?: string
          token_hash?: string | null
          updated_at?: string
        }
        Update: {
          child_profile_id?: string
          created_at?: string
          created_by?: string
          display_name?: string
          family_id?: string
          id?: string
          last_seen_at?: string | null
          paired_at?: string | null
          pairing_code_hash?: string | null
          pairing_expires_at?: string | null
          platform?: string
          policy?: Json
          policy_version?: number
          revoked_at?: string | null
          status?: string
          token_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "managed_devices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_devices_child_membership_fkey"
            columns: ["family_id", "child_profile_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["family_id", "profile_id"]
          },
        ]
      }
      device_command_deliveries: {
        Row: {
          acknowledged_at: string | null
          attempt_count: number
          child_profile_id: string
          command_id: string
          created_at: string
          delivered_at: string | null
          device_id: string
          error_message: string | null
          family_id: string
          id: string
          max_attempts: number
          next_attempt_at: string
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          attempt_count?: number
          child_profile_id: string
          command_id: string
          created_at?: string
          delivered_at?: string | null
          device_id: string
          error_message?: string | null
          family_id: string
          id?: string
          max_attempts?: number
          next_attempt_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          attempt_count?: number
          child_profile_id?: string
          command_id?: string
          created_at?: string
          delivered_at?: string | null
          device_id?: string
          error_message?: string | null
          family_id?: string
          id?: string
          max_attempts?: number
          next_attempt_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_command_deliveries_command_id_fkey"
            columns: ["command_id"]
            isOneToOne: false
            referencedRelation: "device_commands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_command_deliveries_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "managed_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_commands: {
        Row: {
          attempt_count: number
          child_profile_id: string
          command: string
          created_at: string
          error_message: string | null
          external_id: string | null
          family_id: string
          id: string
          idempotency_key: string
          last_attempt_at: string | null
          max_attempts: number
          next_attempt_at: string
          policy: string | null
          processed_at: string | null
          requested_by: string
          session_id: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          child_profile_id: string
          command: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          family_id: string
          id?: string
          idempotency_key?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          policy?: string | null
          processed_at?: string | null
          requested_by: string
          session_id?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          child_profile_id?: string
          command?: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          family_id?: string
          id?: string
          idempotency_key?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          policy?: string | null
          processed_at?: string | null
          requested_by?: string
          session_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_commands_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_commands_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_commands_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "learning_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_check_answers: {
        Row: {
          answered_at: string
          answered_by: string
          id: string
          is_correct: boolean
          question_id: string
          selected_option: number
          session_id: string
        }
        Insert: {
          answered_at?: string
          answered_by: string
          id?: string
          is_correct: boolean
          question_id: string
          selected_option: number
          session_id: string
        }
        Update: {
          answered_at?: string
          answered_by?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_option?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_check_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quick_check_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_check_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "learning_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_check_questions: {
        Row: {
          active: boolean
          correct_option: number
          created_at: string
          family_id: string
          id: string
          options: Json
          prompt: string
          sort_order: number
          subject: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          correct_option: number
          created_at?: string
          family_id: string
          id?: string
          options: Json
          prompt: string
          sort_order?: number
          subject: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          correct_option?: number
          created_at?: string
          family_id?: string
          id?: string
          options?: Json
          prompt?: string
          sort_order?: number
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_check_questions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      session_tasks: {
        Row: {
          created_at: string
          id: string
          is_done: boolean
          session_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_done?: boolean
          session_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_done?: boolean
          session_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_tasks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "learning_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          family_id: string
          id: string
          is_read: boolean
          message: string
          recipient_id: string
          sender_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          is_read?: boolean
          message: string
          recipient_id: string
          sender_id?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          is_read?: boolean
          message?: string
          recipient_id?: string
          sender_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          experience_points: number
          full_name: string | null
          grade_level: number | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          experience_points?: number
          full_name?: string | null
          grade_level?: number | null
          id: string
          role: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          experience_points?: number
          full_name?: string | null
          grade_level?: number | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_events: {
        Row: {
          child_profile_id: string
          created_at: string
          day_of_week: string
          duration_minutes: number
          event_type: string
          family_id: string
          id: string
          sort_order: number
          start_time: string
          status: string
          study_lock_enabled: boolean
          subject: string | null
          title: string
          updated_at: string
        }
        Insert: {
          child_profile_id: string
          created_at?: string
          day_of_week: string
          duration_minutes: number
          event_type: string
          family_id: string
          id?: string
          sort_order?: number
          start_time: string
          status?: string
          study_lock_enabled?: boolean
          subject?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          child_profile_id?: string
          created_at?: string
          day_of_week?: string
          duration_minutes?: number
          event_type?: string
          family_id?: string
          id?: string
          sort_order?: number
          start_time?: string
          status?: string
          study_lock_enabled?: boolean
          subject?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_events_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_occurrences: {
        Row: {
          child_profile_id: string
          created_at: string
          ends_at: string
          event_type: string
          family_id: string
          id: string
          occurrence_date: string
          schedule_event_id: string | null
          starts_at: string
          status: string
          study_lock_enabled: boolean
          subject: string | null
          title: string
          updated_at: string
        }
        Insert: {
          child_profile_id: string
          created_at?: string
          ends_at: string
          event_type: string
          family_id: string
          id?: string
          occurrence_date: string
          schedule_event_id?: string | null
          starts_at: string
          status?: string
          study_lock_enabled?: boolean
          subject?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          child_profile_id?: string
          created_at?: string
          ends_at?: string
          event_type?: string
          family_id?: string
          id?: string
          occurrence_date?: string
          schedule_event_id?: string | null
          starts_at?: string
          status?: string
          study_lock_enabled?: boolean
          subject?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_occurrences_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_occurrences_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_occurrences_schedule_event_id_fkey"
            columns: ["schedule_event_id"]
            isOneToOne: false
            referencedRelation: "schedule_events"
            referencedColumns: ["id"]
          },
        ]
      }
      session_events: {
        Row: {
          event_time: string
          event_type: string
          id: string
          metadata: Json
          session_id: string
        }
        Insert: {
          event_time?: string
          event_type: string
          id?: string
          metadata?: Json
          session_id: string
        }
        Update: {
          event_time?: string
          event_type?: string
          id?: string
          metadata?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "learning_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      study_lock_events: {
        Row: {
          action: string
          child_profile_id: string
          created_at: string
          family_id: string
          id: string
          reason: string | null
          session_id: string | null
          triggered_by: string | null
        }
        Insert: {
          action: string
          child_profile_id: string
          created_at?: string
          family_id: string
          id?: string
          reason?: string | null
          session_id?: string | null
          triggered_by?: string | null
        }
        Update: {
          action?: string
          child_profile_id?: string
          created_at?: string
          family_id?: string
          id?: string
          reason?: string | null
          session_id?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_lock_events_child_profile_id_fkey"
            columns: ["child_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_lock_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_lock_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "learning_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_lock_events_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attach_session_evidence: {
        Args: {
          p_child_profile_id: string
          p_evidence_path: string
          p_family_id: string
          p_session_id: string
        }
        Returns: boolean
      }
      apply_week_plan: {
        Args: { p_events: Json; p_plan_id: string }
        Returns: number
      }
      approve_learning_session: {
        Args: { p_session_id: string }
        Returns: string
      }
      create_child_exception: {
        Args: {
          p_child_profile_id: string
          p_description: string
          p_family_id: string
          p_recommended_action: string
          p_severity?: string
          p_title: string
        }
        Returns: string
      }
      create_generated_ai_plan: {
        Args: {
          p_child_profile_id: string
          p_family_id: string
          p_input_summary: string
          p_model_name: string
          p_output_json: Json
          p_plan_type: string
        }
        Returns: string
      }
      create_learning_goal: {
        Args: {
          p_child_profile_id: string
          p_family_id: string
          p_subject: string
          p_target_minutes: number
        }
        Returns: string
      }
      add_child_profile: {
        Args: { p_child_name: string }
        Returns: {
          account_space_id: string
          child_name: string
          child_profile_id: string
          parent_profile_id: string
        }[]
      }
      add_child_profile_with_grade: {
        Args: { p_child_name: string; p_grade_level: number }
        Returns: {
          account_space_id: string
          child_grade_level: number
          child_name: string
          child_profile_id: string
          parent_profile_id: string
        }[]
      }
      clear_child_data: {
        Args: { p_child_profile_id: string }
        Returns: number
      }
      claim_ai_plan_quota: {
        Args: { p_child_profile_id: string; p_family_id: string }
        Returns: {
          remaining: number
          resets_at: string
        }[]
      }
      claim_device_command: {
        Args: { p_command_id: string }
        Returns: boolean
      }
      create_device_pairing: {
        Args: {
          p_child_profile_id: string
          p_display_name: string
          p_family_id: string
          p_platform: string
          p_policy?: Json | null
        }
        Returns: {
          device_id: string
          expires_at: string
          pairing_code: string
        }[]
      }
      enter_child_mode: {
        Args: { p_child_profile_id: string; p_family_id: string }
        Returns: boolean
      }
      complete_app_onboarding: {
        Args: {
          p_child_profile_id?: string | null
          p_family_id?: string | null
          p_mode: string
        }
        Returns: {
          app_mode: string
          child_profile_id: string | null
          family_id: string | null
        }[]
      }
      get_account_children: {
        Args: never
        Returns: {
          account_space_id: string
          child_avatar_url: string | null
          child_grade_level: number | null
          child_joined_at: string
          child_name: string
          child_profile_id: string
          parent_profile_id: string
        }[]
      }
      get_app_mode: {
        Args: Record<PropertyKey, never>
        Returns: {
          app_mode: string
          child_profile_id: string | null
          family_id: string | null
        }[]
      }
      get_app_onboarding_status: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      get_subject_suggestions: {
        Args: { p_child_profile_id: string }
        Returns: {
          curriculum_group: string
          education_stage: string
          sort_order: number
          subject_name: string
        }[]
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: boolean
      }
      update_child_avatar: {
        Args: {
          p_avatar_path: string | null
          p_child_profile_id: string
          p_family_id: string
        }
        Returns: string | null
      }
      prepare_device_command_for_agents: {
        Args: { p_command_id: string }
        Returns: number
      }
      redeem_child_milestone: {
        Args: { p_milestone_id: string }
        Returns: boolean
      }
      dashboard_metrics: { Args: never; Returns: Json }
      request_session_break: {
        Args: { p_minutes?: number; p_session_id: string }
        Returns: string
      }
      revoke_managed_device: {
        Args: { p_device_id: string }
        Returns: boolean
      }
      reset_child_engagement: {
        Args: { p_child_profile_id: string }
        Returns: boolean
      }
      save_child_milestone: {
        Args: {
          p_child_profile_id: string
          p_description: string
          p_family_id: string
          p_target_points: number
          p_title: string
        }
        Returns: string
      }
      save_schedule_setup: {
        Args: {
          p_child_profile_id: string
          p_events: Json
          p_family_id: string
        }
        Returns: number
      }
      save_session_note: {
        Args: { p_note: string; p_session_id: string }
        Returns: boolean
      }
      send_parent_message: {
        Args: {
          p_child_profile_id: string
          p_family_id: string
          p_message: string
        }
        Returns: number
      }
      update_child_profile: {
        Args: {
          p_child_name: string
          p_child_profile_id: string
        }
        Returns: boolean
      }
      update_child_profile_details: {
        Args: {
          p_child_name: string
          p_child_profile_id: string
          p_grade_level: number
        }
        Returns: boolean
      }
      update_managed_device_policy: {
        Args: { p_device_id: string; p_policy: Json }
        Returns: number
      }
      start_learning_session: {
        Args: { p_session_id: string }
        Returns: string
      }
      submit_learning_session: {
        Args: {
          p_answers: Json
          p_duration_minutes: number
          p_reflection: string
          p_session_id: string
          p_tasks: Json
        }
        Returns: {
          device_command_id: string | null
          session_status: string
        }[]
      }
      update_device_command_delivery: {
        Args: {
          p_command_id: string
          p_error_message?: string | null
          p_external_id?: string | null
          p_status: string
        }
        Returns: boolean
      }
    }
    Enums: {
      alert_status: "OPEN" | "RESOLVED" | "CANCELLED"
      crm_role: "SM" | "HoEC" | "EC" | "FRONT_DESK" | "ACADEMIC" | "CS"
      lead_temperature: "Nóng" | "Ấm" | "Lạnh" | "Chăm lại"
      member_status: "ACTIVE" | "INACTIVE" | "INVITED"
      payment_status: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED"
      task_status: "OPEN" | "DONE" | "CANCELLED"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_status: ["OPEN", "RESOLVED", "CANCELLED"],
      crm_role: ["SM", "HoEC", "EC", "FRONT_DESK", "ACADEMIC", "CS"],
      lead_temperature: ["Nóng", "Ấm", "Lạnh", "Chăm lại"],
      member_status: ["ACTIVE", "INACTIVE", "INVITED"],
      payment_status: ["PENDING", "SUCCESS", "FAILED", "REFUNDED"],
      task_status: ["OPEN", "DONE", "CANCELLED"],
    },
  },
} as const
