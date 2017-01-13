<template>
    <div>
        <div class="top">
            <div class="top-bar row align-middle">
                <div class="cel">
                    <span :class="['label','label-'+label]">{{displayValue("Type")}}</span>
                    <span class="label" :class="'label-' + getSignalColour()">{{displayValue("Status")}}</span>
                </div>
                <div class="cel actions">
                    <split-button ref="actionMenu" v-on:action="action('updateStatus')" :title="maketext(stateAction)">
                        <li v-on:click="action('edit')">{{maketext('Edit entry')}}</li>
                        <li v-on:click="action('delete')">{{maketext('Delete entry')}}</li>
                        <li v-on:click="action('move')">{{maketext('Move entry')}}</li>
                        <li v-on:click="action('permalink')">{{maketext('Get Permalink')}}</li>
                    </split-button>
                </div>
            </div>
            <hr/>
                <h3 class="top-title">{{displayValue("Title")}}</h3>
            <hr/>
        </div>
        <div class="scroll-container">
            <div ref="description" class="description">
                <div v-html="readMore" :key="expandText"></div>
                <div v-if="showReadMore" class="show-more">
                    <span class="button hollow secondary" v-on:click="toggleExpandText">
                        {{maketext(expandText ? "Show less" : "Show more")}}
                    </span>
                </div>
            </div>
            <h3 class="top-title">Details</h3>
            <hr/>
            <div>
                <div class="row align-middle details" v-for="(field, index) in fieldsToShow">
                    <div class="columns title">{{description(field)}}:</div>
                    <div class="columns small-7">{{displayValue(field)}}</div>
                </div>
            </div>
            <div class="top-space row align-middle">
                <div class="columns">
                    <h3 class="top-title">{{maketext('Comments')}}</h3>
                </div>
                <div class="columns action" v-on:click="toggleAddComment">
                    <span v-if="comments.length != 0">
                        <template v-if="!addComment">
                            <i class="fa fa-plus"></i>
                        </template>
                        <template v-else>
                            <i class="fa fa-minus"></i>
                        </template>
                    </span>
                </div>
            </div>
            <hr/>
            <comment-area v-on:toggle-add-comment="toggleAddComment" :add-comment="showAddComment"></comment-area>
        </div>
        <div class="bottom-bar">
            <button class="button default" v-on:click="prev"><i class="fa fa-chevron-left"></i></button>
            <button class="button default" v-on:click="next"><i class="fa fa-chevron-right"></i></button>
        </div>
        <div class="pseudo-hidden">
            <input type="text" ref="permalink" v-model="permalink">
        </div>
    </div>
</template>

<script>
import TaskPanelMixin from "../../../mixins/TaskPanelMixin.vue";
import SplitButton from "./SplitButton.vue";
import CommentArea from "./CommentArea.vue";
import * as mutations from '../../../store/mutation-types';

/* global $ moment document foswiki swal */
export default {
    mixins: [TaskPanelMixin],
    data() {
        return {
            expandText: false,
            showChar: 1000,
            showReadMore: false,
            addComment: false,
            permalink: '',
            hover: ''
        };
    },
    components: {
        SplitButton,
        CommentArea
    },
    computed: {
        showAddComment() {
            return this.addComment || this.comments.length == 0;
        },
        stateAction() {
            if(this.isClosed){
                return 'Reopen entry';
            }
            return 'Close entry';
        },
        isClosed() {
            let taskStatus = this.task.fields['Status'].value;
            return taskStatus === 'closed';
        },
        readMore() {
            let text = this.displayValue("Description");
            if(!this.expandText && text.length > this.showChar) {
                let content = text.substring(0, this.showChar);
                this.showReadMore = true;
                return content;
            } else if (text.length > this.showChar) {
                this.showReadMore = true;
                return text;
            }
            this.showReadMore = false;
            return text;
        },
        readAll() {
            let text = this.displayValue("Description");
            if(this.showReadMore) {
                return text.substring(this.showChar, text.length - this.showChar);
            }
        },
        comments() {
            if(this.task.changesets){
                return this.task.changesets.filter(function (change) {
                    return change.comment ? true : false;
                }).reverse();
            }
            return {};
        },
        label(){
            let value = this.task.fields["Type"].value;
            let output = 'info';
            $.each(this.typeConfig.fields, function( key, config) {
                if(config.id === 'type') {
                    $.each(config.component.labels, function( key, style) {
                        if(value === key ) {
                            output = style;
                            return false;
                        }
                    });
                }
            });
            return output;
        },
    },
    methods: {
        toggleExpandText() {
            this.expandText = !this.expandText;
        },
        toggleAddComment(newState) {
            if(typeof(newState) === "boolean"){
                this.addComment = newState;
            } else {
                this.addComment = !this.addComment;
            }
        },
        displayAt(at) {
            return moment.unix(parseInt(at)).format('DD.MM.YYYY - HH:mm');
        },
        getSignalColour() {
            let $dueDate = Math.round(parseInt(this.task.fields["DueDate"].value)/60/60/24);
            let $now = Math.round((new Date).getTime()/1000/60/60/24);
            let $warn = 5;
            $.each(this.typeConfig.fields, function( key, config) {
                if(config.id === 'status') {
                    if(config.component.warn) {
                        $warn = parseInt(config.component.warn);
                    }
                    return false;
                }
            });
            if($dueDate && $dueDate >= $now + ($warn*60*24)){
                return 'info';
            }else if($dueDate && $dueDate >= $now) {
                return 'primary';
            }
            return 'measure';
        },
        action(type) {
            let self = this;
            let onLeaseTaken = function(){
                swal({
                    title: self.maketext("Editing not possible."),
                    text: self.maketext("This task is currently edited by another user. Please try again later."),
                    type: "warning",
                    confirmButtonColor: "#D83314",
                    confirmButtonText: self.maketext("Confirm"),
                    closeOnConfirm: true,
                    allowEscapeKey: false
                });
            };
            switch (type) {
                case 'edit':
                    this.$store.dispatch("switchEditMode", {enable: true, onLeaseTaken});
                    break;
                case 'move':
                    this.$store.commit(mutations.CHANGE_PANEL_DIALOG_STATE, true);
                    this.$refs.actionMenu.splitOpen = false;
                    break;
                case 'delete': {
                    let request = {
                        id: this.task.id,
                        Status: 'deleted',
                    };
                    this.$store.dispatch('updateTask', {gridState: this.grid, request});
                    break;
                }
                case 'permalink': {
                    let p = foswiki.preferences;
                    let url = [
                        p.SCRIPTURL,
                        '/restauth',
                        p.SCRIPTSUFFIX,
                        '/TasksAPIPlugin/permalink?id=',
                        this.task.id
                    ].join('');
                    this.permalink = url;
                    this.$nextTick(function() {
                        this.$refs.permalink.focus();
                        this.$refs.permalink.setSelectionRange(0, url.length);
                        document.execCommand('copy');
                        swal({
                            title: self.maketext("Copied"),
                            text: self.maketext("The link was copied to your clipboard."),
                            type: "success",
                            confirmButtonText: self.maketext("Confirm"),
                            closeOnConfirm: true,
                            allowEscapeKey: true
                        });
                    });
                    this.$refs.actionMenu.splitOpen = false;
                    break;
                }
                case 'updateStatus': {
                    let newStatus = 'closed';
                    if (this.isClosed) {
                        newStatus = 'open';
                    }
                    let request = {
                        id: this.task.id,
                        Status: newStatus,
                    };
                    this.$store.dispatch('updateTask', {gridState: this.grid, request, onLeaseTaken});
                    break;
                }
                default:
                    console.warn("Unknown action: " + type);
            }
        }
    }
};
</script>

<style lang="sass">
.flatskin-wrapped {
    .panel hr {
        height: 0px;
        color: #F7F6F3;
        border-top: 2px solid #F7F6F3;
        width: calc(100% +54px);
        margin-left: -35px;
        margin-right: -35px;
    }
}
.top-space{
    margin-top: 35px;
    .columns {
        padding: 0;
    }
}
.scroll-container {
    overflow-y: auto;
    height: calc( 100vh - 9.6rem);
    padding: 0px 35px 50px;
    .details {
        padding: 6px 0;
        min-height: 30px;
        .columns {
            padding: 0;
        }
        .title {
            color: #7F7B71;
            font-size: 13px;
        }
    }
    .action {
        color: #52cae4;
        text-align: right;
        font-size: 0.9rem;
    }
    .right {
        text-align: right;
    }
}
.top{
    padding: 5px 35px 0px 35px;
    h3.top-title {
        font-size: 18px;
        padding: 4px 0px;
    }
    hr:last-child{
        margin-bottom: 0;
    }
}
.pseudo-hidden {
    position: absolute;
    left: -9999px;
    top: -9999px;
}
.top-bar {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    height: 48px;
    .cel {
        flex: 1;
    }
    span.label{
        width: initial;
        padding: .5em .6em .5em;
        min-width: 50px;
    }
    .actions {
        text-align: right;
    }
}
.description {
    position: relative;
    margin-bottom: 20px;
    .show-more {
        padding: 6px;
        height: 53px;
        bottom: 0;
        width: 100%;
        text-align: center;
        margin: 0;
		background-color: white;
        .button {
            margin-top: 12px;
            padding: 9px 10px;
            font-size: 14px;
        }
    }
}
h3.top-title {
    font-weight: 400;
    font-size: 16px;
    color: #52cae4;
    margin: 0;
}
.bottom-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    border-top: solid 2px #F7F6F3;
    width: 100%;
    background-color: white;
    height: 57px;
    justify-content: center;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: flex-start;
    padding: 0 35px;
    .button {
        height: 31px;
        width: 31px;
        padding: 0;
        margin: 0.7rem 0.2rem;
    }
}
</style>
