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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      auditoria: {
        Row: {
          accion: string
          actor: string | null
          creado_en: string
          estado_anterior: Json | null
          estado_nuevo: Json | null
          id: number
          registro_id: string | null
          tabla: string
        }
        Insert: {
          accion: string
          actor?: string | null
          creado_en?: string
          estado_anterior?: Json | null
          estado_nuevo?: Json | null
          id?: never
          registro_id?: string | null
          tabla: string
        }
        Update: {
          accion?: string
          actor?: string | null
          creado_en?: string
          estado_anterior?: Json | null
          estado_nuevo?: Json | null
          id?: never
          registro_id?: string | null
          tabla?: string
        }
        Relationships: []
      }
      barberos: {
        Row: {
          activo: boolean
          actualizado_en: string
          avatar_url: string | null
          creado_en: string
          es_admin: boolean
          id: string
          nombre: string
          orden: number
          telefono: string | null
          user_id: string | null
          yape_numero: string | null
          yape_titular: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          avatar_url?: string | null
          creado_en?: string
          es_admin?: boolean
          id?: string
          nombre: string
          orden?: number
          telefono?: string | null
          user_id?: string | null
          yape_numero?: string | null
          yape_titular?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          avatar_url?: string | null
          creado_en?: string
          es_admin?: boolean
          id?: string
          nombre?: string
          orden?: number
          telefono?: string | null
          user_id?: string | null
          yape_numero?: string | null
          yape_titular?: string | null
        }
        Relationships: []
      }
      bloqueos: {
        Row: {
          barbero_id: string | null
          creado_en: string
          fin: string
          id: string
          inicio: string
          motivo: string | null
          rango: unknown
        }
        Insert: {
          barbero_id?: string | null
          creado_en?: string
          fin: string
          id?: string
          inicio: string
          motivo?: string | null
          rango?: unknown
        }
        Update: {
          barbero_id?: string | null
          creado_en?: string
          fin?: string
          id?: string
          inicio?: string
          motivo?: string | null
          rango?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "bloqueos_barbero_id_fkey"
            columns: ["barbero_id"]
            isOneToOne: false
            referencedRelation: "barberos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueos_barbero_id_fkey"
            columns: ["barbero_id"]
            isOneToOne: false
            referencedRelation: "barberos_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      citas: {
        Row: {
          actualizado_en: string
          adelanto_centimos: number
          barbero_id: string
          cancelada_en: string | null
          captura_path: string | null
          captura_subida_en: string | null
          cerrada_en: string | null
          cliente_id: string
          codigo: string
          confirmada_en: string | null
          confirmada_por: string | null
          creado_en: string
          duracion_min: number
          estado: Database["public"]["Enums"]["estado_cita"]
          expira_en: string | null
          fin: string
          id: string
          inicio: string
          motivo_rechazo: string | null
          notas: string | null
          precio_centimos: number
          rango: unknown
          recordatorio_email_en: string | null
          servicio_id: string
          servicio_nombre: string
        }
        Insert: {
          actualizado_en?: string
          adelanto_centimos: number
          barbero_id: string
          cancelada_en?: string | null
          captura_path?: string | null
          captura_subida_en?: string | null
          cerrada_en?: string | null
          cliente_id: string
          codigo: string
          confirmada_en?: string | null
          confirmada_por?: string | null
          creado_en?: string
          duracion_min: number
          estado?: Database["public"]["Enums"]["estado_cita"]
          expira_en?: string | null
          fin: string
          id?: string
          inicio: string
          motivo_rechazo?: string | null
          notas?: string | null
          precio_centimos: number
          rango?: unknown
          recordatorio_email_en?: string | null
          servicio_id: string
          servicio_nombre: string
        }
        Update: {
          actualizado_en?: string
          adelanto_centimos?: number
          barbero_id?: string
          cancelada_en?: string | null
          captura_path?: string | null
          captura_subida_en?: string | null
          cerrada_en?: string | null
          cliente_id?: string
          codigo?: string
          confirmada_en?: string | null
          confirmada_por?: string | null
          creado_en?: string
          duracion_min?: number
          estado?: Database["public"]["Enums"]["estado_cita"]
          expira_en?: string | null
          fin?: string
          id?: string
          inicio?: string
          motivo_rechazo?: string | null
          notas?: string | null
          precio_centimos?: number
          rango?: unknown
          recordatorio_email_en?: string | null
          servicio_id?: string
          servicio_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "citas_barbero_id_fkey"
            columns: ["barbero_id"]
            isOneToOne: false
            referencedRelation: "barberos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_barbero_id_fkey"
            columns: ["barbero_id"]
            isOneToOne: false
            referencedRelation: "barberos_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_confirmada_por_fkey"
            columns: ["confirmada_por"]
            isOneToOne: false
            referencedRelation: "barberos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_confirmada_por_fkey"
            columns: ["confirmada_por"]
            isOneToOne: false
            referencedRelation: "barberos_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          actualizado_en: string
          creado_en: string
          email: string | null
          id: string
          nombre: string
          notas: string | null
          telefono: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          email?: string | null
          id?: string
          nombre: string
          notas?: string | null
          telefono: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          email?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          telefono?: string
        }
        Relationships: []
      }
      horarios: {
        Row: {
          activo: boolean
          barbero_id: string
          creado_en: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id: string
        }
        Insert: {
          activo?: boolean
          barbero_id: string
          creado_en?: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id?: string
        }
        Update: {
          activo?: boolean
          barbero_id?: string
          creado_en?: string
          dia_semana?: number
          hora_fin?: string
          hora_inicio?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "horarios_barbero_id_fkey"
            columns: ["barbero_id"]
            isOneToOne: false
            referencedRelation: "barberos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horarios_barbero_id_fkey"
            columns: ["barbero_id"]
            isOneToOne: false
            referencedRelation: "barberos_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones: {
        Row: {
          canal: Database["public"]["Enums"]["canal_notificacion"]
          cita_id: string | null
          creado_en: string
          destino: string | null
          error: string | null
          estado: Database["public"]["Enums"]["estado_notificacion"]
          id: string
          proveedor_id: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
        }
        Insert: {
          canal: Database["public"]["Enums"]["canal_notificacion"]
          cita_id?: string | null
          creado_en?: string
          destino?: string | null
          error?: string | null
          estado?: Database["public"]["Enums"]["estado_notificacion"]
          id?: string
          proveedor_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacion"]
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal_notificacion"]
          cita_id?: string | null
          creado_en?: string
          destino?: string | null
          error?: string | null
          estado?: Database["public"]["Enums"]["estado_notificacion"]
          id?: string
          proveedor_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_notificacion"]
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          cita_id: string
          creado_en: string
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto_centimos: number
          nota: string | null
          referencia: string | null
          registrado_por: string | null
          tipo: Database["public"]["Enums"]["tipo_pago"]
        }
        Insert: {
          cita_id: string
          creado_en?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto_centimos: number
          nota?: string | null
          referencia?: string | null
          registrado_por?: string | null
          tipo: Database["public"]["Enums"]["tipo_pago"]
        }
        Update: {
          cita_id?: string
          creado_en?: string
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto_centimos?: number
          nota?: string | null
          referencia?: string | null
          registrado_por?: string | null
          tipo?: Database["public"]["Enums"]["tipo_pago"]
        }
        Relationships: [
          {
            foreignKeyName: "pagos_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "barberos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "barberos_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios: {
        Row: {
          activo: boolean
          actualizado_en: string
          adelanto_pct: number
          creado_en: string
          descripcion: string | null
          duracion_min: number
          id: string
          nombre: string
          orden: number
          precio_centimos: number
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          adelanto_pct?: number
          creado_en?: string
          descripcion?: string | null
          duracion_min: number
          id?: string
          nombre: string
          orden?: number
          precio_centimos: number
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          adelanto_pct?: number
          creado_en?: string
          descripcion?: string | null
          duracion_min?: number
          id?: string
          nombre?: string
          orden?: number
          precio_centimos?: number
        }
        Relationships: []
      }
    }
    Views: {
      barberos_publicos: {
        Row: {
          avatar_url: string | null
          id: string | null
          nombre: string | null
          orden: number | null
        }
        Insert: {
          avatar_url?: string | null
          id?: string | null
          nombre?: string | null
          orden?: number | null
        }
        Update: {
          avatar_url?: string | null
          id?: string | null
          nombre?: string | null
          orden?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      barbero_actual: { Args: never; Returns: string }
      crear_reserva: {
        Args: {
          p_barbero_id: string
          p_email?: string
          p_inicio: string
          p_nombre: string
          p_notas?: string
          p_servicio_id: string
          p_telefono: string
        }
        Returns: Json
      }
      es_admin: { Args: never; Returns: boolean }
      es_barbero: { Args: never; Returns: boolean }
      estados_vivos: {
        Args: never
        Returns: Database["public"]["Enums"]["estado_cita"][]
      }
      generar_codigo: { Args: never; Returns: string }
      horarios_disponibles: {
        Args: {
          p_barbero_id: string
          p_fecha: string
          p_paso?: string
          p_servicio_id: string
        }
        Returns: string[]
      }
      liberar_vencidas: { Args: never; Returns: number }
      registrar_captura: {
        Args: { p_cita_id: string; p_codigo: string; p_path: string }
        Returns: Json
      }
      slot_dentro_de_jornada: {
        Args: { p_barbero_id: string; p_fin: string; p_inicio: string }
        Returns: boolean
      }
    }
    Enums: {
      canal_notificacion: "email" | "whatsapp"
      estado_cita:
        | "pendiente_pago"
        | "en_revision"
        | "confirmada"
        | "atendida"
        | "no_show"
        | "liberada"
        | "cancelada"
      estado_notificacion: "pendiente" | "enviado" | "fallido"
      metodo_pago: "yape" | "plin" | "efectivo" | "transferencia" | "otro"
      tipo_notificacion:
        | "pre_reserva"
        | "confirmacion"
        | "recordatorio"
        | "rechazo"
        | "liberada"
        | "cancelada"
      tipo_pago: "adelanto" | "saldo" | "reembolso"
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
      canal_notificacion: ["email", "whatsapp"],
      estado_cita: [
        "pendiente_pago",
        "en_revision",
        "confirmada",
        "atendida",
        "no_show",
        "liberada",
        "cancelada",
      ],
      estado_notificacion: ["pendiente", "enviado", "fallido"],
      metodo_pago: ["yape", "plin", "efectivo", "transferencia", "otro"],
      tipo_notificacion: [
        "pre_reserva",
        "confirmacion",
        "recordatorio",
        "rechazo",
        "liberada",
        "cancelada",
      ],
      tipo_pago: ["adelanto", "saldo", "reembolso"],
    },
  },
} as const
