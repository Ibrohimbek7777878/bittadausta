/* client_erp/js/components/skeleton.js — Loading skeletons */
var Skeleton = {
    block: function(h, w, r) {
        return '<div class="skeleton-block" style="height:'+h+';width:'+(w||'100%')+';border-radius:'+(r||'10px')+'"></div>';
    },
    gap: function(h) { return '<div style="height:'+(h||'8')+'px"></div>'; },

    dashboard: function() {
        var b = this.block, g = this.gap;
        return '<div class="page-enter">' +
            '<div class="ce-card" style="padding:16px;margin-bottom:16px"><div style="display:flex;align-items:center;gap:12px">' +
            b('48px','48px','50%') + '<div style="flex:1">' + b('16px','40%') + g(6) + b('12px','25%') + '</div></div>' + g(12) + b('8px') + '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">' + b('70px') + b('70px') + b('70px') + '</div>' +
            b('14px','30%') + g(10) +
            b('80px','100%','14px') + g(8) + b('80px','100%','14px') + g(8) + b('80px','100%','14px') +
            '</div>';
    },
    ordersList: function() {
        var b = this.block, g = this.gap, out = '<div class="page-enter">' + b('18px','35%') + g(12);
        for (var i = 0; i < 5; i++) out += b('90px','100%','14px') + g(8);
        return out + '</div>';
    },
    orderDetail: function() {
        var b = this.block, g = this.gap;
        return '<div class="page-enter">' + b('22px','50%') + g(10) + b('8px') + g(16) +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">' +
            b('60px') + b('60px') + b('60px') + b('60px') + '</div>' +
            b('65px','100%','14px') + g(8) + b('65px','100%','14px') + g(8) + b('65px','100%','14px') +
            '</div>';
    },
    clientsList: function() {
        var b = this.block, g = this.gap, out = '<div class="page-enter">' + b('18px','30%') + g(12);
        for (var i = 0; i < 4; i++) {
            out += '<div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">' +
                b('42px','42px','50%') + '<div style="flex:1">' + b('14px','50%') + g(6) + b('12px','35%') + '</div></div>';
        }
        return out + '</div>';
    },
    finance: function() {
        var b = this.block, g = this.gap;
        var out = '<div class="page-enter"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">' +
            b('50px') + b('50px') + b('50px') + b('50px') + '</div>' + b('18px','25%') + g(10);
        for (var i = 0; i < 5; i++) out += b('55px','100%','10px') + g(6);
        return out + '</div>';
    },
    oldiBerdi: function() {
        var b = this.block, g = this.gap;
        var out = '<div class="page-enter">' + b('18px','30%') + g(8) + b('12px','20%') + g(14);
        out += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">' + b('56px') + b('56px') + '</div>';
        out += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:14px">' + b('48px') + b('48px') + b('48px') + b('48px') + '</div>';
        out += '<div style="display:flex;gap:6px;margin-bottom:14px">' + b('30px','70px','15px') + b('30px','80px','15px') + b('30px','70px','15px') + b('30px','70px','15px') + '</div>';
        for (var i = 0; i < 5; i++) out += b('60px','100%','10px') + g(6);
        return out + '</div>';
    },
    genericList: function(count) {
        var b = this.block, g = this.gap, out = '<div class="page-enter">' + b('18px','30%') + g(12);
        for (var i = 0; i < (count||4); i++) out += b('70px','100%','14px') + g(8);
        return out + '</div>';
    },
};
