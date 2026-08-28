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
      ai_execution_events: {
        Row: {
          conversation_id: string | null
          created_at: string
          error_code: string | null
          estimated_cost: number | null
          execution_id: string
          id: string
          input_chars: number | null
          input_tokens: number | null
          latency_ms: number
          lead_id: string | null
          model: string | null
          output_chars: number | null
          output_tokens: number | null
          prompt_id: string | null
          prompt_version: string | null
          sources: string[]
          specialist: string | null
          status: string
          task: string
          tools_used: string[]
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          estimated_cost?: number | null
          execution_id: string
          id?: string
          input_chars?: number | null
          input_tokens?: number | null
          latency_ms?: number
          lead_id?: string | null
          model?: string | null
          output_chars?: number | null
          output_tokens?: number | null
          prompt_id?: string | null
          prompt_version?: string | null
          sources?: string[]
          specialist?: string | null
          status: string
          task: string
          tools_used?: string[]
          user_id?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          error_code?: string | null
          estimated_cost?: number | null
          execution_id?: string
          id?: string
          input_chars?: number | null
          input_tokens?: number | null
          latency_ms?: number
          lead_id?: string | null
          model?: string | null
          output_chars?: number | null
          output_tokens?: number | null
          prompt_id?: string | null
          prompt_version?: string | null
          sources?: string[]
          specialist?: string | null
          status?: string
          task?: string
          tools_used?: string[]
          user_id?: string
        }
        Relationships: []
      }
      ai_router_logs: {
        Row: {
          attempt_index: number
          created_at: string
          error_type: string | null
          fallback_reason: string | null
          id: string
          input_chars: number
          latency_ms: number
          model: string
          success: boolean
          task: string
        }
        Insert: {
          attempt_index?: number
          created_at?: string
          error_type?: string | null
          fallback_reason?: string | null
          id?: string
          input_chars?: number
          latency_ms?: number
          model: string
          success: boolean
          task: string
        }
        Update: {
          attempt_index?: number
          created_at?: string
          error_type?: string | null
          fallback_reason?: string | null
          id?: string
          input_chars?: number
          latency_ms?: number
          model?: string
          success?: boolean
          task?: string
        }
        Relationships: []
      }
      commercial_memory: {
        Row: {
          approved: boolean
          confidence: number
          content: string
          created_at: string
          embedding: string
          id: string
          kind: string
          metadata: Json
          source_lead_id: string | null
          title: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          approved?: boolean
          confidence?: number
          content: string
          created_at?: string
          embedding: string
          id?: string
          kind: string
          metadata?: Json
          source_lead_id?: string | null
          title: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          approved?: boolean
          confidence?: number
          content?: string
          created_at?: string
          embedding?: string
          id?: string
          kind?: string
          metadata?: Json
          source_lead_id?: string | null
          title?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      interactions_inbound: {
        Row: {
          call_id: string | null
          created_at: string
          dados: Json
          id: string
          phone_normalized: string | null
          processed: boolean
          processed_at: string | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          dados: Json
          id?: string
          phone_normalized?: string | null
          processed?: boolean
          processed_at?: string | null
        }
        Update: {
          call_id?: string | null
          created_at?: string
          dados?: Json
          id?: string
          phone_normalized?: string | null
          processed?: boolean
          processed_at?: string | null
        }
        Relationships: []
      }
      leads_inbound: {
        Row: {
          created_at: string
          dados: Json
          id: string
        }
        Insert: {
          created_at?: string
          dados: Json
          id?: string
        }
        Update: {
          created_at?: string
          dados?: Json
          id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          display_name: string | null
          first_name: string | null
          id: string
          job_title: string | null
          last_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          display_name?: string | null
          first_name?: string | null
          id: string
          job_title?: string | null
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_storage: {
        Row: {
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string | null
          direction: string
          id: string
          lead_id: string | null
          message_type: string
          phone_number: string
          raw_payload: Json | null
          status: string | null
          timestamp: string
          user_id: string
          wa_message_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          direction: string
          id?: string
          lead_id?: string | null
          message_type: string
          phone_number: string
          raw_payload?: Json | null
          status?: string | null
          timestamp: string
          user_id: string
          wa_message_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          direction?: string
          id?: string
          lead_id?: string | null
          message_type?: string
          phone_number?: string
          raw_payload?: Json | null
          status?: string | null
          timestamp?: string
          user_id?: string
          wa_message_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_commercial_memory: {
        Args: {
          filter_kind?: string
          filter_niche?: string
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          kind: string
          metadata: Json
          similarity: number
          title: string
          usage_count: number
        }[]
      }
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
    Enums: {},
  },
} as const
