// $(function() {
$.tablesorter.addParser({
    id: "taskAmpelSorter",
    is: function(s) {
        return false;
    },
    format: function(txt, table, col) {
        var src = $(col).children("img").attr("src");
        var val = -1;
        if (/ampel.png$/.test(src)) val = 0; else if (/ampel_g.png$/.test(src)) val = 1; else if (/ampel_o.png$/.test(src)) val = 2; else if (/ampel_r.png$/.test(src)) val = 3;
        return $.tablesorter.formatInt(val);
    },
    type: "numeric"
});

$.tablesorter.addParser({
    id: "taskDateSorter",
    is: function(s) {
        return false;
    },
    format: function(txt, table, col) {
        var $td = $(col);
        var val = $td.data("value");
        if (val) {
            return $.tablesorter.formatInt(val);
        }
        try {
            val = $td.children("span").first().text() || txt;
            return $.tablesorter.formatInt(new Date(val).getTime());
        } catch (e) {}
        return 0;
    },
    type: "numeric"
});