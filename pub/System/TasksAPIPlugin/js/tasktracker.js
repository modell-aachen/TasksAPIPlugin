(function($, _, document, window, undefined) {
    "use strict";
    $.fn.tasksGrid = function() {
        if (typeof _ === typeof undefined) {
            error("Missing dependency underscore.js");
            return this;
        }
        if (!$("#task-editor").length) {
            $("body").append('<div id="task-editor"></div>');
        }
        return this.each(function() {
            var $this = $(this);
            var id = $this.attr("id");
            var json = $this.children(".settings").text();
            var opts = $.parseJSON(json);
            opts.cntHeight = $this.height();
            opts.container = $this.children(".tasks-table").children(".tasks");
            opts.currentState = "open";
            $this.data("tasktracker_options", opts);
            var $tasks = opts.container;
            var $editor = $("#task-editor");
            var $filter = $this.children(".filter");
            var $status = $filter.find('select[name="status"]');
            var params = parseQueryParams();
            if (params.state) {
                opts.currentState = params.state;
                $status.val(params.state);
            }
            loadTasks($this, opts.currentState, true);
            if (opts.infinite) {
                var isLoading = false;
                var infiniteScroll = function() {
                    if (isLoading) {
                        return;
                    }
                    var top = $(window).scrollTop();
                    var dh = $(document).height();
                    var wh = $(window).height();
                    var trigger = .8;
                    if (top / (dh - wh) > trigger) {
                        var rowCnt = $this.find("> .tasks-table > tbody > tr").length;
                        if (rowCnt >= opts.totalsize) {
                            isLoading = false;
                            return false;
                        }
                        var url = getViewUrl() + "?page=" + Math.round(rowCnt / opts.pagesize + .5);
                        if (params.state) {
                            url += "&state=" + params.state;
                        }
                        $('<div class="tasks-tmp-container" style="display: none"></div>').appendTo("body");
                        $.blockUI();
                        isLoading = true;
                        $(".tasks-tmp-container").load(url + " #" + id, function(response) {
                            var $tmp = $(this);
                            var $rows = $tmp.find("#" + id + "> .tasks-table > tbody > tr");
                            if ($rows.length < opts.pagesize) {
                                $(window).off("scroll", infiniteScroll);
                            }
                            $rows.each(function() {
                                var $task = $(this).detach();
                                var $data = $task.find("> .task-data-container > .task-data");
                                if ($data.length > 0) {
                                    var data = unescapeHTML($.parseJSON($data.text()));
                                    data.html = $("<div></div>").append($task).html();
                                    opts.container.append(createTaskElement(data));
                                }
                            });
                            isLoading = false;
                            $tmp.remove();
                            if (opts.sortable) {
                                try {
                                    invokeTablesorter.call($this.children(".tasks-table"), false, true);
                                } catch (e) {
                                    error(e);
                                }
                            }
                            $.unblockUI();
                        });
                    }
                };
                $(window).on("scroll", infiniteScroll);
            }
            var handleCreate = function() {
                var qopts = {};
                $.extend(qopts, opts);
                qopts.trackerId = opts.id;
                qopts._depth = parseInt(opts.depth);
                delete qopts.id;
                delete qopts.depth;
                var $self = $(this);
                var parent;
                if ($self.hasClass("task-new")) {
                    qopts.$table = $self.parent();
                    var $parent = $self.closest(".task-children-container").prev();
                    parent = $parent.data("id");
                    if (parent) {
                        qopts.parent = parent;
                        var pdata = $parent.data("task_data");
                        qopts._depth = parseInt(pdata.depth) - 1;
                    }
                } else {
                    qopts.$table = $(opts.container);
                }
                var beforeCreate = $.Event("beforeCreate");
                $this.trigger(beforeCreate, qopts);
                if (beforeCreate.isDefaultPrevented()) {
                    return false;
                }
                delete qopts.$table;
                delete qopts.container;
                delete qopts.lang;
                var evtResult = beforeCreate.result;
                if (_.isObject(evtResult)) {
                    delete evtResult.id;
                    delete evtResult.trackerId;
                    $.extend(qopts, evtResult);
                }
                $editor.taskEditor(qopts).done(function(type, data) {
                    if (type === "save") {
                        var pid = data.fields.Parent.value;
                        if (!parent) {
                            opts.container.append(createTaskElement(data));
                        } else {
                            $(createTaskElement(data)).insertBefore($self);
                        }
                        applyLevels();
                    }
                }).fail(error);
                return false;
            };
            var handleStatusFilterChanged = function() {
                var $select = $(this);
                var url = getViewUrl() + "?state=" + $select.val();
                window.location = url;
            };
            $filter.find(".tasks-btn-create").on("click", handleCreate);
            $this.on("click", ".task-new", handleCreate);
            $status.on("change", handleStatusFilterChanged);
            $editor.on("afterSave", function(evt, task) {
                if ($status.length > 0 && task.Status !== $status.val()) {
                    $tasks.find(".task").each(function() {
                        var $t = $(this);
                        if ($t.data("id") === task.id) {
                            $t.remove();
                            return false;
                        }
                    });
                }
                if (opts.sortable) {
                    try {
                        invokeTablesorter.call($this.children(".tasks-table"), true);
                    } catch (e) {
                        error(e);
                    }
                }
            });
            if (opts.sortable) {
                try {
                    invokeTablesorter.call($this.children(".tasks-table"));
                } catch (e) {
                    error(e);
                }
            } else {
                // moved here due to perfomance reasons (tablesorter vs mutation observers)
                $this.observe("added", "tr.task", function(record) {
                    detachEventHandler();
                    attachEventHandler();
                });
            }
            return this;
        });
    };
    var getViewUrl = function() {
        var p = foswiki.preferences;
        return [ p.SCRIPTURL, "/view", p.SCRIPTSUFFIX, "/", p.WEB, "/", p.TOPIC ].join("");
    };
    var invokeTablesorter = function(forceSort, updateOnly) {
        var $tbl = $(this);
        if (!forceSort && $tbl.find("> tbody .task").length === 0) {
            return;
        }
        if (updateOnly) {
            setTimeout(function() {
                $tbl.trigger("update");
            }, 10);
        }
        var opts = $tbl.data("sortopts");
        if (typeof opts === "object") {
            var $col = $tbl.find("> thead .headerSortUp, > thead .headerSortDown").first();
            $tbl.trigger("update");
            if ($col.length > 0) {
                var dir = $col.hasClass("headerSortUp") ? 1 : 0;
                var index = $col[0].column;
                // tablesorter's update event is processed by a timeout of 1.
                // use something higher than 1 here...
                setTimeout(function() {
                    $tbl.trigger("sorton", [ [ [ index, dir ] ] ]);
                }, 10);
            }
            return;
        }
        opts = $tbl.metadata() || {};
        $tbl.data("sortopts", opts);
        $tbl.tablesorter(opts).bind("sortStart", onSortStart).bind("sortEnd", onSortEnd);
    };
    var unescapeHTML = function(obj) {
        if (!obj.fields) {
            return obj;
        }
        for (var prop in obj.fields) {
            obj.fields[prop].value = obj.fields[prop].value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
        }
        return obj;
    };
    var loadTasks = function($tracker, status, initial, parent, container) {
        var deferred = $.Deferred();
        var opts = $tracker.data("tasktracker_options");
        if (!container) {
            container = opts.container;
        }
        if (opts.query) {
            var json = $.parseJSON(opts.query);
            if (json.Status && opts.currentState) {
                json.Status = opts.currentState;
                opts.query = JSON.stringify(json);
            }
        }
        if (initial) {
            var results = [];
            $(container).children(".task").each(function(idx, e) {
                var $task = $(e);
                var data = unescapeHTML($.parseJSON($task.children(".task-data-container").children(".task-data").text()));
                initTaskElement($task, data);
                results.push(data);
                $task.find(".task-children .tasks").each(function() {
                    $(this).children(".task").each(function() {
                        var $task = $(this);
                        var data = unescapeHTML($.parseJSON($task.children(".task-data-container").children(".task-data").text()));
                        initTaskElement($task, data);
                    });
                });
            });
            deferred.resolve({
                data: results
            });
            return deferred.promise();
        }
        $.blockUI();
        var query = {
            Context: opts.context
        };
        if (opts.parent !== "any") {
            query.Parent = parent || "";
        }
        $.extend(query, $.parseJSON(opts.query));
        if (!/^(1|true)$/i.test(opts.stateless) && status !== "all") {
            query.Status = status;
        } else {
            if (opts.currentState !== "all") {
                query.Status = [ opts.currentState ];
            } else {
                query.Status = [ "open", "closed" ];
            }
        }
        var qopts = {};
        $.extend(qopts, opts);
        qopts.query = query;
        qopts._depth = opts.depth;
        $.taskapi.get(qopts).always(function() {
            $.unblockUI();
        }).done(function(response) {
            _.each(response.data, function(entry) {
                var $task = createTaskElement(entry);
                container.append($task);
            });
            deferred.resolve(response.data);
        }).fail(deferred.reject);
        return deferred.promise();
    };
    var getTaskSibling = function(direction) {
        var sel, func;
        if (/^(left|up|prev)$/i.test(direction)) {
            sel = "last";
            func = "prev";
        } else {
            sel = "first";
            func = "next";
        }
        var $task = $(this);
        var $sibling = $task[func]();
        if ($sibling.hasClass("task-children-container")) {
            $sibling = $sibling[func]();
        }
        if (!$sibling.hasClass("task")) {
            var $children = $task.parent().children(sel);
            $sibling = $task.parent().children(".task")[sel]();
        }
        return $sibling;
    };
    var hoveredTask;
    var toggleTaskDetails = function(evt) {
        if (!hoveredTask) {
            return false;
        }
        var $task = hoveredTask;
        var data = {
            isDetailsView: $task.hasClass("highlight"),
            container: $task
        };
        var e = $.Event("toggleDetails");
        var $tracker = $task.closest(".tasktracker");
        $tracker.trigger(e, data);
        var showFunc = function() {
            var self = this;
            $task.children(".task-fullview-container").children(".task-fullview").detach().appendTo(this);
            $task.addClass("highlight");
            var wh = $(window).height();
            var sy = window.scrollY;
            var ot = $task.offset().top;
            var th = $task.height();
            if (sy + wh < ot + th || sy > ot) {
                $("body,html").animate({
                    scrollTop: ot - th
                });
            }
            var saveComment = function(evt) {
                var $self = $(this);
                var $comment = $self.closest(".task-fullview").children(".comment");
                var txt = $comment.find("textarea").val();
                var cb = $comment.find('input[name="close"]');
                var opts = $tracker.data("tasktracker_options") || {};
                var payload = {
                    id: $task.data("id"),
                    comment: txt
                };
                $.extend(payload, _.pick(opts, "form", "tasktemplate", "templatefile"));
                var close = cb.attr("checked");
                if (close) {
                    payload.Status = "closed";
                }
                $.blockUI();
                $.taskapi.update(payload).fail(error).done(function(response) {
                    var expanded = $task.is(".expanded");
                    var $newTask = $(createTaskElement(response.data));
                    $task.replaceWith($newTask);
                    if (expanded) {
                        $newTask.next().remove();
                        var $expander = $newTask.children(".expander");
                        toggleTaskExpand.call($expander);
                    }
                    $tracker.panel.replace.call(self, $newTask);
                    if (close) {
                        $(".tasks-btn-next:visible").trigger("click");
                    }
                }).always($.unblockUI);
                return false;
            };
            var toggleUpload = function(evt) {
                var $self = $(this);
                var $upload = $self.closest(".task-fullview").children(".upload");
                $upload.toggleClass("active");
                return false;
            };
            var toggleComment = function(evt) {
                var $self = $(this);
                var $comment = $self.closest(".task-fullview").children(".comment");
                var $upload = $self.closest(".task-fullview").children(".upload");
                if ($upload.is(".active")) {
                    $upload.removeClass("active");
                }
                $comment.toggleClass("active");
                var $actions = $self.closest(".actions");
                var $a = $actions.children(".active");
                var $h = $actions.children(".hidden");
                $a.toggleClass("active").toggleClass("hidden");
                $h.toggleClass("active").toggleClass("hidden");
                if (evt.data === true) {
                    $comment.find('input[name="close"]').prop("checked", true);
                }
                return false;
            };
            var editViewer = function(evt) {
                $("#task-panel").children(".close").click();
                hoveredTask = $task;
                editClicked();
                return false;
            };
            var uploadFinished = function() {
                var $dnd = $(this);
                var web = $dnd.data("web");
                var topic = $dnd.data("topic");
                var id = web + "." + topic;
                $.taskapi.get({
                    query: {
                        id: id
                    }
                }).done(function(result) {
                    if (result.status !== "ok" || result.data.length === 0) {
                        return;
                    }
                    var $html = $(result.data[0].html);
                    var $viewer = $html.children(".task-fullview-container").find(".viewer").detach();
                    $viewer.find(".tasks-btn-edit").on("click", editViewer);
                    $dnd.closest(".task-fullview").children(".viewer").replaceWith($viewer);
                    if (window.foswiki.ModacContextMenuPlugin) {
                        var $table = $viewer.find("div.foswikiAttachments > table");
                        var tds = $table.find("td.foswikiTableCol1");
                        $.each(tds, function(i, e) {
                            foswiki.ModacContextMenuPlugin.attachContextMenu(e);
                        });
                    }
                });
            };
            var nextTask = function() {
                hoveredTask = getTaskSibling.call($task, "next");
                $tracker.panel.replace.call(self, hoveredTask);
                return false;
            };
            var prevTask = function() {
                hoveredTask = getTaskSibling.call($task, "prev");
                $tracker.panel.replace.call(self, hoveredTask);
                return false;
            };
            var cancelComment = function() {
                var $self = $(this);
                var $actions = $self.closest(".actions");
                var $a = $actions.children(".active");
                var $h = $actions.children(".hidden");
                $a.toggleClass("active").toggleClass("hidden");
                $h.toggleClass("active").toggleClass("hidden");
                var $comment = $actions.parent().children(".comment");
                $comment.find("textarea").val("");
                $comment.find('input[name="close"]').prop("checked", false);
                $comment.toggleClass("active");
                return false;
            };
            this.find(".tasks-btn-next").on("click", nextTask);
            this.find(".tasks-btn-prev").on("click", prevTask);
            this.find(".tasks-btn-comment").on("click", toggleComment);
            this.find(".tasks-btn-upload").on("click", toggleUpload);
            this.find(".qw-dnd-upload").on("queueEmpty", uploadFinished);
            this.find(".tasks-btn-edit").on("click", editViewer);
            this.find(".tasks-btn-close").on("click", true, toggleComment);
            this.find(".tasks-btn-save-comment").on("click", saveComment);
            this.find(".tasks-btn-cancel-comment").on("click", cancelComment);
        };
        var hideFunc = function() {
            this.find(".tasks-btn-save-comment").off("click");
            this.find(".tasks-btn-cancel-comment").off("click");
            this.find(".tasks-btn-comment").off("click");
            this.find(".tasks-btn-upload").off("click");
            this.find(".tasks-btn-edit").off("click");
            this.find(".tasks-btn-next").off("click");
            this.find(".tasks-btn-close").off("click");
            this.find(".tasks-btn-prev").off("click");
            this.find(".qw-dnd-upload").off("queueEmpty");
            this.find(".task-fullview").detach().appendTo($task.children(".task-fullview-container"));
            $task.removeClass("highlight");
        };
        $tracker.panel = $tracker.taskPanel({
            show: showFunc,
            hide: hideFunc,
            replace: function(newTask) {
                var self = this;
                hideFunc.call(self);
                $task = hoveredTask = $(newTask);
                showFunc.call(self);
            }
        });
        $tracker.panel.show();
    };
    var initTaskElement = function($task, task) {
        $task.data("id", task.id);
        $task.data("task_data", task);
    };
    var createTaskElement = function(task) {
        var $task = $(task.html);
        initTaskElement($task, task);
        return $task;
    };
    var editClicked = function() {
        if (!hoveredTask) {
            return false;
        }
        var $task = hoveredTask;
        var edopts = {};
        var $tracker = $task.closest(".tasktracker");
        var opts = $tracker.data("tasktracker_options");
        for (var p in opts) {
            if (/string|number|boolean/.test(typeof opts[p])) {
                edopts[p] = opts[p];
            }
        }
        var task = unescapeHTML($.parseJSON($task.children(".task-data-container").text()));
        edopts.autoassign = opts.autoassign;
        edopts.data = task;
        edopts.id = task.id;
        edopts.lang = opts.lang;
        edopts._depth = task.depth;
        edopts.trackerId = $tracker.attr("id");
        var expanded = $task.is(".expanded");
        $task.addClass("highlight");
        $("#task-editor").taskEditor(edopts).done(function(type, data) {
            $task.removeClass("highlight");
            if (type === "save") {
                if (data.fields.Status.value === "deleted") {
                    $task.remove();
                } else {
                    var $newTask = $(createTaskElement(data));
                    $task.replaceWith($newTask);
                    if (expanded) {
                        $newTask.next().remove();
                        var $expander = $newTask.children(".expander");
                        toggleTaskExpand.call($expander);
                    }
                }
                applyLevels();
            }
        }).fail(function(type, msg) {
            error(msg);
        });
    };
    var error = function() {
        if (window.console && console.error) {
            _.each([].splice.call(arguments, 0), function(msg) {
                console.error(msg);
            });
        }
    };
    var log = function(msg) {
        if (window.console && console.log) {
            _.each([].splice.call(arguments, 0), function(msg) {
                console.log(msg);
            });
        }
    };
    var taskMouseEnter = function(evt) {
        var $task = $(this);
        // if (hoveredTask) {
        //   $('body > .controls').detach().appendTo($(hoveredTask).children('.task-controls'));
        // }
        hoveredTask = $task;
    };
    // var taskMouseLeave = function(evt) {
    //   var $node = $(evt.toElement || evt.relatedTarget);
    //   var isCtrl = $node.hasClass('controls') ||
    //                 $node.parent().hasClass('controls') ||
    //                 $node.parent().parent().hasClass('controls');
    //   if ( isCtrl ) {
    //     return;
    //   }
    //   var $cnt = $(hoveredTask).children('.task-controls');
    //   $('body').children('.controls').detach().appendTo($cnt);
    //   // hoveredTask = undefined;
    // };
    var resetControls = function() {
        var $ctrl = $(this).parent();
        $ctrl.detach().appendTo($(hoveredTask).children(".task-controls"));
        hoveredTask = undefined;
    };
    var toggleTaskExpand = function(evt) {
        var $col = $(this);
        var $row = $col.parent();
        $row.toggleClass("expanded");
        // update tablesorter to respect child rows
        var $tbl = $col.closest(".tasks-table:not(.children)");
        $tbl.trigger("update");
        var isExpanded = $row.hasClass("expanded");
        if (isExpanded) {
            var span = $row.children("td").length;
            var $children = $row.children(".task-children").children("table.children").detach();
            var $new = $('<tr class="task-children-container"><td class="dashed-line" colspan="' + span + '"></td></tr>');
            $new.children("td").append($children);
            $new.insertAfter($row);
        } else {
            var $next = $row.next();
            var $table = $next.children("td").children("table.children").detach();
            $table.appendTo($row.children(".task-children"));
            $next.remove();
        }
        applyLevels();
    };
    var closeTask = function(evt) {
        var $task = hoveredTask;
        if (closeTaskEx()) {
            return false;
        }
        $task.removeClass("highlight");
        return false;
    };
    var closeTaskEx = function() {
        hoveredTask.addClass("highlight");
        var $task = hoveredTask;
        var $next = $task.next();
        var $tracker = hoveredTask.closest(".tasktracker");
        var opts = $tracker.data("tasktracker_options");
        swal({
            title: "Sind Sie sicher?",
            text: "Möchten Sie diesen Protokollpunkt schließen?",
            type: "warning",
            showCancelButton: true,
            confirmButtonColor: "#6CCE86",
            cancelButtonColor: "#BDBDBD",
            confirmButtonText: "Ja",
            cancelButtonText: "Nein",
            closeOnConfirm: false
        }, function(confirmed) {
            if (confirmed) {
                var data = hoveredTask.data("task_data");
                var payload = {
                    id: data.id,
                    Status: "closed"
                };
                $.blockUI();
                $.taskapi.update(payload).fail(error).done(function(response) {
                    $task.remove();
                    if ($next.hasClass("task-children-container")) {
                        $next.remove();
                    }
                    swal("Erledigt!", "Protokollpunkt wurde als geschlossen markiert.", "success");
                }).always($.unblockUI);
            }
            return confirmed;
        });
    };
    var applyLevels = function() {
        $(".task:visible, .task-new:visible").each(function(i, e) {
            var lvl = 0;
            var $task = $(e);
            var $t = $(this);
            while ($t.parent().closest(".tasks-table").length) {
                $t = $t.parent().closest(".tasks-table");
                lvl++;
            }
            $task.attr("class", function(j, cls) {
                return cls.replace(/(^|\s)alternate/g, "") + (lvl % 2 === 0 ? " alternate" : "");
            });
        });
    };
    var attachEventHandler = function() {
        // detach all handlers first
        // moved here due to performance reasons
        // (mutation observer's 'removed listener' is pretty slow)
        detachEventHandler();
        $(".tasks .task").on("mouseenter", taskMouseEnter).on("click", ".expander", toggleTaskExpand).on("click", toggleTaskDetails);
        $(".table-task-actions .btn-close").on("click", closeTask);
        $(".table-task-actions .btn-details").on("click", toggleTaskDetails);
        $(".table-task-actions .btn-edit").on("click", editClicked);
    };
    var detachEventHandler = function() {
        $(".tasks .task").off("mouseenter", taskMouseEnter).off("click", ".expander", toggleTaskExpand).off("click", toggleTaskDetails);
        $(".table-task-actions .btn-close").off("click", closeTask);
        $(".table-task-actions .btn-details").off("click", toggleTaskDetails);
        $(".table-task-actions .btn-edit").off("click", editClicked);
        $(".table-task-actions .task-btn").off("click", resetControls);
    };
    // due to performance reasons, stop any mutation observers
    var onSortStart = function() {
        $(".tasktracker").disconnect();
    };
    // (re)attach mutation observers
    var onSortEnd = function() {
        $(".tasktracker").observe("added", "tr.task", function(record) {
            attachEventHandler();
        });
    };
    var parseQueryParams = function(query) {
        var q = query || window.location.search || "";
        if (/^;|#|\?/.test(q)) {
            q = q.substr(1);
        }
        var retval = {};
        var arr = q.split("&");
        for (var i = 0; i < arr.length; ++i) {
            var p = arr[i].split("=");
            retval[p[0]] = p[1];
        }
        return retval;
    };
    $(document).ready(function() {
        $(".tasktracker").tasksGrid();
        attachEventHandler();
        applyLevels();
    });
})(jQuery, window._, window.document, window);

(function($, _, document, window, undefined) {
    "use strict";
    $.fn.taskEditor = function(opts) {
        if (this.length === 0) {
            return;
        }
        var $this = this;
        $this.data("id", _.isUndefined(opts.id) ? "" : opts.id);
        $this.data("parent", _.isUndefined(opts.parent) ? "" : opts.parent);
        if (opts.trackerId) {
            $this.data("trackerId", opts.trackerId);
        }
        var def = $.Deferred();
        var beforeEdit = $.Event("beforeEdit");
        $this.trigger(beforeEdit, opts);
        if (beforeEdit.isDefaultPrevented()) {
            def.resolve("cancel_plugin", opts);
            return def.promise();
        }
        var data = opts.data;
        delete opts.data;
        if (!data) {
            data = {
                fields: {}
            };
        }
        var evtResult = beforeEdit.result;
        if (_.isObject(evtResult)) {
            opts = _.extend(opts, evtResult);
        }
        $.blockUI();
        leaseTopic(opts).done(function(response) {
            updateHead(response.scripts);
            updateHead(response.styles);
            var $ed = $("<div>" + response.editor + "</div>");
            $ed.find(".ma-taskeditor-cke").addClass("ignoreObserver");
            $this.html($ed.html());
            $this.find(".tasks-btn-save").click(handleSave);
            $this.find(".tasks-btn-cancel").click(handleCancel);
            writeEditor(data);
            if (opts.autoassign && opts.autoassignTarget) {
                var $type = $this.find('select[name="Type"]');
                var $target = $this.find('input[name="' + opts.autoassignTarget + '"]');
                var autoassign = opts.autoassign.split(",");
                var assign = {};
                var assignees = [];
                _.each(opts.autoassign.split(","), function(a) {
                    var arr = a.split("=");
                    assign[arr[0]] = arr[1];
                    assignees.push(arr[1]);
                });
                var setAssignee = function() {
                    var $self = $(this);
                    var val = $self.val();
                    var assignTo = assign[val];
                    if (assignTo) {
                        $target.closest("." + opts.autoassignTarget).css("display", "none");
                        setTimeout(function() {
                            $target.trigger("Clear");
                            $target.trigger("AddValue", assignTo);
                        }, 100);
                    } else {
                        $target.closest("." + opts.autoassignTarget).css("display", "block");
                        var tval = $target.val();
                        if (assignees.indexOf(val) === -1 && assignees.indexOf(tval) === -1) {
                            $target.trigger("Clear");
                        }
                    }
                };
                $type.on("change", setAssignee);
                setAssignee.call($type);
            }
            $this.panel = $this.taskPanel({
                show: function() {
                    var $panel = this;
                    $this.find(".ignoreObserver").removeClass("ignoreObserver");
                    $this.detach().appendTo($panel);
                    $("#InputTitle input").focus();
                },
                hide: function() {
                    handleCancel();
                    $this.detach().empty().appendTo($("body"));
                }
            });
            $this.panel.show();
            var afterEdit = $.Event("afterEdit");
            $this.trigger(afterEdit);
        }).fail(function(msg) {
            def.reject("lease", msg);
        }).always($.unblockUI);
        var closeEditor = function() {
            if (!_.isUndefined(this)) {
                $this.panel.hide();
            }
        };
        var handleCancel = function() {
            var self = this;
            var $up = $this.find(".qw-dnd-upload");
            if ($up.length) {
                $up.clearQueue();
            }
            var taskid = opts.id;
            if (!taskid) {
                def.resolve("cancel");
                closeEditor.call(self);
                return false;
            }
            $.blockUI();
            releaseTopic({
                id: taskid
            }).always($.unblockUI).fail(function(msg) {
                def.reject("cancel_clearlease", msg);
            }).done(function() {
                def.resolve("cancel", taskid);
            }).always(function() {
                closeEditor.call(self);
            });
            return false;
        };
        var handleSave = function() {
            var task = readEditor();
            // missing value for mandatory field
            if (task.hasError) {
                var msg = decodeURIComponent(opts.lang.missingField) + ": " + task.missingFields;
                alert(msg);
                return false;
            }
            for (var prop in opts) {
                if (/template|form/.test(prop)) {
                    task[prop] = opts[prop];
                }
            }
            if ($this.data("parent") && !task.Parent) {
                task.Parent = $this.data("parent");
            }
            var beforeSave = $.Event("beforeSave");
            $this.trigger(beforeSave, task);
            if (beforeSave.isDefaultPrevented()) {
                return false;
            }
            $.blockUI();
            var doSaveTask = function() {
                task._depth = opts._depth > 0 ? opts._depth : 0;
                if (!task.id) {
                    task.Context = opts.context;
                    if (!task.Status) {
                        task.Status = "open";
                    }
                    $.taskapi.create(task).fail(error).always($.unblockUI).done(function(response) {
                        task.id = response.id;
                        var afterSave = $.Event("afterSave");
                        $this.trigger(afterSave, task);
                        closeEditor.call(1);
                        def.resolve("save", response.data);
                    });
                    return;
                }
                $.taskapi.update(task).fail(error).done(function(response) {
                    var afterSave = $.Event("afterSave");
                    $this.trigger(afterSave, task);
                    closeEditor.call(1);
                    def.resolve("save", response.data);
                }).always($.unblockUI);
            };
            var $up = $this.find(".qw-dnd-upload");
            if ($up.length) {
                $up.on("queueEmpty", doSaveTask);
                $up.upload();
            } else {
                doSaveTask();
            }
            return false;
        };
        var writeEditor = function(task) {
            _.each(task.fields, function(field) {
                var sel = [ "input#", field.name, ",", 'input[name="', field.name, '"],textarea[name="', field.name, '"],select[name="', field.name, '"]' ].join("");
                var $input = $this.find(sel);
                if ($input.hasClass("foswikiEditFormDateField")) {
                    if (/^\d+$/.test(field.value) || /^\d+\s\w+\s\d+$/.test(field.value)) {
                        var d;
                        if (/^\d+\s\w+\s\d+$/.test(field.value)) {
                            d = new Date(field.value);
                        } else {
                            d = new Date();
                            d.setTime(parseInt(field.value + "000"));
                        }
                        $input.val(d.print("%e %b %Y"));
                    }
                } else {
                    $input.val(field.value);
                }
            });
        };
        var readEditor = function() {
            var data = {
                id: $this.data("id"),
                hasError: false
            };
            var missingFields = [];
            $this.find("input[name],select[name],textarea[name]").each(function() {
                var $input = $(this);
                var prop = $input.attr("name");
                var val = $input.val();
                if ($input.hasClass("foswikiEditFormDateField")) {
                    try {
                        if (val) {
                            var d = new Date(val);
                            val = d.print("%s");
                        }
                    } catch (e) {
                        error(e);
                    }
                }
                if (/^$/.test(val)) {
                    val = $input.attr("value");
                    if (/^$/.test(val)) {
                        val = $input[0].getAttribute("value");
                    }
                }
                if ($input.hasClass("foswikiMandatory") && (/^$/.test(val) || val === null || val === undefined)) {
                    var fname = $input.parent().find("span").text().replace(/\*/g, "");
                    missingFields.push(fname);
                    data.hasError = true;
                    return false;
                }
                data[prop] = val !== null ? val : "";
            });
            if (data.hasError) {
                data.missingFields = missingFields.join(", ");
            }
            return data;
        };
        return def.promise();
    };
    var error = function(msg) {
        if (!msg) {
            return;
        }
        if (window.console && console.error) {
            console.error(msg);
        }
    };
    var log = function(msg) {
        if (!msg) {
            return;
        }
        if (window.console && console.log) {
            console.log(msg);
        }
    };
    var handleLease = function(action, payload) {
        var deferred = $.Deferred();
        var prefs = foswiki.preferences;
        var url = [ prefs.SCRIPTURL, "/rest", prefs.SCRIPTSUFFIX, "/TasksAPIPlugin/", action ].join("");
        $.ajax({
            url: url,
            data: payload,
            success: function(response) {
                var json = $.parseJSON(response);
                deferred.resolve(json);
            },
            error: function(xhr, sts, err) {
                deferred.reject(err);
            }
        });
        return deferred.promise();
    };
    var releaseTopic = function(data) {
        var payload = {
            request: JSON.stringify(data)
        };
        return handleLease("release", payload);
    };
    var leaseTopic = function(data) {
        var payload = {
            request: JSON.stringify(data)
        };
        return handleLease("lease", payload, data.id);
    };
    var loadedScripts = [];
    var loadScript = function(id, script) {
        if (loadedScripts.indexOf(id) !== -1) {
            return;
        }
        loadedScripts.push(id);
        $(script).appendTo($("head"));
    };
    var updateHead = function(data) {
        var $head = $("head");
        var html = $head.html();
        _.each(data, function(entry) {
            var r = new RegExp(entry.id);
            if (!r.test(html)) {
                _.each(entry.requires, function(require) {
                    var rr = new RegExp(require.id);
                    if (!rr.test(html)) {
                        loadScript(require.id, require.text);
                    }
                });
                loadScript(entry.id, entry.text);
                html = $head.html();
            }
        });
    };
})(jQuery, window._, window.document, window);

(function($, _, document, window, undefined) {
    "use strict";
    $.fn.taskPanel = function(opts) {
        if ($("#task-panel").length === 0) {
            $('<div id="task-panel"><div class="close"></div><div class="content"></div></div>').appendTo("body");
            $('<div id="task-overlay"></div>').appendTo("body");
        }
        $("#task-overlay").off("click").on("click", function() {
            toggleDetails(opts);
        });
        $("#task-panel > .close").off("click").on("click", function() {
            toggleDetails(opts);
        });
        var $container = $("#task-panel");
        var $panel = $container.children(".content");
        var toggle = function() {
            var self = this;
            setTimeout(function() {
                toggleDetails(self);
                setLinkTarget();
            }, 100);
        };
        var killCKE = function() {
            if (CKEDITOR && CKEDITOR.instances) {
                for (var p in CKEDITOR.instances) {
                    CKEDITOR.instances[p].destroy();
                }
            }
        };
        return {
            hide: function() {
                toggle.call(opts);
                killCKE();
            },
            replace: function() {
                if (typeof opts.replace === "function") {
                    opts.replace.apply(this, arguments);
                    setLinkTarget();
                }
            },
            show: function() {
                toggle.call(opts);
            }
        };
    };
    var setLinkTarget = function() {
        var $panel = $("#task-panel").children(".content");
        $panel.find("a:not(.tasks-btn)").each(function() {
            var $link = $(this);
            if ($link.attr("href") !== "#") {
                $link.attr("target", "_blank");
            }
        });
    };
    var toggleDetails = function(opts) {
        var $overlay = $("#task-overlay");
        var $panel = $("#task-panel").children(".content");
        var $body = $("body");
        $overlay.toggleClass("active");
        if ($overlay.hasClass("active")) {
            $body.css("overflow", "hidden");
            $overlay.show();
            if (typeof opts.show === "function") {
                opts.show.call($panel);
            }
            $("#task_desc_box article").readmore({
                collapsedHeight: 150,
                speed: 200,
                lessLink: '<a class="readmore_link" href="#">Weniger anzeigen</a>',
                moreLink: '<a class="readmore_link" href="#">Mehr anzeigen</a>'
            });
            $("#task-panel .task-changeset").slice(3).hide();
            if ($("#task-panel .task-changeset").length > 3) {
                $('<a id="more-changeset" href="">Weitere Änderungen anzeigen</a>').insertAfter("#task-panel .task-changeset:last");
                $("#more-changeset").on("click", function() {
                    $("#task-panel .task-changeset").fadeIn("slow");
                    $("#more-changeset").off("click");
                    $("#more-changeset").remove();
                    return false;
                });
            }
        } else {
            $("#task-panel .task-changeset").show();
            $("#more-changeset").off("click");
            $("#more-changeset").remove();
            $("#task_desc_box article").readmore("destroy");
            $overlay.hide();
            $body.css("overflow", "");
            if (typeof opts.hide === "function") {
                opts.hide.call($panel);
            }
        }
        $("#task-panel").toggleClass("active");
    };
})(jQuery, window._, window.document, window);