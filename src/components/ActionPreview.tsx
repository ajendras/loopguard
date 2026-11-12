'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Globe, 
  Hash, 
  ShieldAlert 
} from 'lucide-react';
import PolicyEngine from '../lib/policy-engine';
import type { Proposal, ApprovalDecision, EvaluationResult } from '../types/index';

interface ActionPreviewProps {
  proposal: Proposal;
  onApprove: (decision: ApprovalDecision) => void;
  onDeny: (decision: ApprovalDecision) => void;
  onEscalate: (decision: ApprovalDecision) => void;
}

const ActionPreview: React.FC<ActionPreviewProps> = ({
  proposal,
  onApprove,
  onDeny,
  onEscalate,
}) => {
  const { action, session, policyEvaluation: incomingEvaluation } = proposal;

  const engine = new PolicyEngine();
  const evaluation: EvaluationResult = incomingEvaluation || engine.evaluate(action);

  const risk = evaluation.risk;

  const getRiskBadge = (r: number) => {
    if (r >= 85) {
      return {
        color: 'bg-rose-500 text-white border-rose-400',
        label: 'CRITICAL',
      };
    }
    if (r >= 65) {
      return {
        color: 'bg-orange-500 text-white border-orange-400',
        label: 'HIGH',
      };
    }
    if (r >= 40) {
      return {
        color: 'bg-amber-500 text-white border-amber-400',
        label: 'MEDIUM',
      };
    }
    return {
      color: 'bg-emerald-500 text-white border-emerald-400',
      label: 'LOW',
    };
  };

  const riskBadge = getRiskBadge(risk);

  const createDecision = (type: 'approved' | 'denied' | 'escalated', reasonOverride?: string): ApprovalDecision => ({
    actionId: action.id,
    decision: type,
    reason: reasonOverride || evaluation.reason,
    overridePolicy: risk > 75,
    timestamp: new Date().toISOString(),
    approver: 'dashboard',
  });

  const handleApprove = () => {
    onApprove(createDecision('approved', 'Human approved after review'));
  };

  const handleDeny = () => {
    onDeny(createDecision('denied', 'Human denied – policy violation'));
  };

  const handleEscalate = () => {
    onEscalate(createDecision('escalated', 'Escalated for senior review'));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.96 }}
      transition={{ type: 'spring', bounce: 0.1, duration: 0.6 }}
      className="group relative bg-glass-dark border border-glass-border rounded-glass shadow-glass overflow-hidden"
    >
      {/* Inner highlight layer */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none rounded-glass" />

      <div className="p-7 relative">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-x-3">
            <div className={`px-4 py-1 text-xs font-semibold tracking-wider rounded-2xl border ${riskBadge.color}`}>
              {riskBadge.label} • {risk}
            </div>
            <div className="uppercase text-xs font-mono text-white/40 pt-0.5">{action.type}</div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="text-white/60">via</div>
            <div className="font-medium text-accent-400 bg-white/5 px-3 py-1 rounded-3xl border border-white/10">
              {session.name}
            </div>
          </div>
        </div>

        <h3 className="text-white text-[21px] leading-tight font-medium mt-5 tracking-[-0.3px]">
          {action.intent}
        </h3>

        {/* URL */}
        <a
          href={action.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors group-hover:underline underline-offset-4"
        >
          <Globe className="w-4 h-4 flex-shrink-0" />
          <span className="line-clamp-1 font-light font-mono">{action.url}</span>
        </a>

        {/* Summary */}
        <div className="mt-7">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-2 font-medium">
            <Hash className="w-3.5 h-3.5" />
            LLM SUMMARY
          </div>
          <p className="text-white/90 text-[13.2px] leading-relaxed pr-6">
            {action.summary}
          </p>
        </div>

        {/* PII Warning */}
        {(action.extractedPii && action.extractedPii.length > 0) || evaluation.triggeredRules.includes('pii-detected') ? (
          <div className="mt-6 flex items-center gap-3 bg-rose-500/10 border border-rose-400/30 rounded-2xl p-4">
            <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div className="text-xs">
              <div className="font-medium text-rose-300">PERSONALLY IDENTIFIABLE INFORMATION DETECTED</div>
              <div className="text-rose-200/70 mt-px">
                {action.extractedPii?.join(' • ') || 'email, phone or credit card pattern'}
              </div>
            </div>
          </div>
        ) : null}

        {/* Triggered rules */}
        {evaluation.triggeredRules.length > 0 && (
          <div className="mt-5 text-[10px] font-mono text-white/30 flex flex-wrap gap-x-2">
            {evaluation.triggeredRules.map((rule) => (
              <span key={rule} className="bg-white/5 px-2 py-px rounded">
                {rule}
              </span>
            ))}
          </div>
        )}

        {/* Decision buttons */}
        <div className="grid grid-cols-3 gap-3 mt-10">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.985 }}
            onClick={handleApprove}
            className="h-14 flex items-center justify-center gap-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-all text-white font-semibold rounded-2xl shadow-inner shadow-emerald-700/40 text-sm"
          >
            <CheckCircle2 className="w-5 h-5" />
            APPROVE
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.985 }}
            onClick={handleDeny}
            className="h-14 flex items-center justify-center gap-2.5 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 transition-all text-white font-semibold rounded-2xl shadow-inner shadow-rose-700/40 text-sm"
          >
            <XCircle className="w-5 h-5" />
            DENY
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.985 }}
            onClick={handleEscalate}
            className="h-14 flex items-center justify-center gap-2.5 border border-white/30 hover:bg-white/5 transition-all text-white/90 font-medium rounded-2xl text-sm"
          >
            <AlertTriangle className="w-4 h-4" />
            ESCALATE
          </motion.button>
        </div>

        <div className="text-center mt-6 text-[10px] text-white/30 font-light tracking-tight">
          {evaluation.reason}
        </div>
      </div>

      {/* Bottom accent bar */}
      <div className="h-1.5 bg-gradient-to-r from-primary-500 via-accent-400 to-transparent" />
    </motion.div>
  );
};

export default ActionPreview;
