export const statusLabel = status => ({draft:'초안',review:'검토 중',approved:'검토 완료'}[status] || '');
export const statusAction = status => status === 'approved'
  ? {label:'초안으로 되돌리기',value:'draft'} : {label:'검토 완료',value:'approved'};
