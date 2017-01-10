<template>
    <div>
        <div class="top">
            <div class="top-bar row align-middle">
                <div class="cel">
                    <span :class="['label','label-'+label]">{{displayValue("Type")}}</span>
                    <span class="label" :class="'label-' + getStateColour()">{{displayValue("Status")}}</span>
                </div>
                <div class="cel actions">
                    <split-button v-on:action="action('updateStatus')" :title="maketext(stateAction)">
                        <li v-on:click="action('edit')">{{maketext('Edit Entry')}}</li>
                        <li v-on:click="action('delete')">{{maketext('Delete Entry')}}</li>
                        <li v-on:click="action('move')">{{maketext('Move Entry')}}</li>
                        <li v-on:click="action('permalink')">{{maketext('Get Permalink')}}</li>
                    </split-button>
                </div>
            </div>
            <hr/>
                <h3 class="top-title">{{displayValue("Title")}}</h3>
            <hr/>
        </div>
        <div class="scroll-container">
            <div ref="description" class="description" v-bind:class="{all: expandText}">
                <p v-html="displayValue('Description')"></p>
                <div v-if="showReadMore" class="show-more">
                    <span class="button hollow secondary" v-on:click="toggleExpandText">
                        {{maketext(expandText ? "Show less" : "Show more")}}
                    </span>
                </div>
            </div>
            <h3 class="top-title">Details</h3>
            <hr/>
            <div>
                <div class="row" v-for="field in fieldsToShow">
                    <div class="title columns">{{description(field)}}:</div>
                    <div class="columns small-5">{{displayValue(field)}}</div>
                </div>
            </div>
            <div class="top-space row align-middle">
                <div class="columns">
                    <h3 class="top-title">{{maketext('Comments')}}</h3>
                </div>
                <div class="columns action" v-on:click="toggleAddComment">
                    <span>
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
            <div>
                <transition name="expand">
                    <div v-show="addComment" style="transform-origin: 50% 0%;">
                        <textarea v-model="newComment" :placeholder="maketext('new comment')"></textarea>
                        <div class="right">
                            <split-button v-on:action="action('saveComment')" :title="maketext('Save comment')">
                                <li v-on:click="action('saveCommentClose')">{{maketext('Save and close entry')}}</li>
                            </split-button>
                        </div>
                    </div>
                </transition>
                <template v-for="comment in comments">
                    <div class="comment-header row align-middle">
                        <div class="title columns shrink">{{comment.user.wikiname}}</div>
                        <div class="title date columns">{{displayAt(comment.at)}}</div>
                    </div>
                    <div class="comment comment-body row" v-html="comment.comment"></div>
                </template>
                <p/>
            </div>
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

/* global $ moment document foswiki */
export default {
    mixins: [TaskPanelMixin],
    data() {
        return {
            expandText: false,
            showReadMore: false,
            addComment: false,
            newComment: '',
            permalink: ''
        };
    },
    components: {
        SplitButton
    },
    computed: {
        stateAction() {
            if(this.isClosed){
                return 'Reopen Entry';
            }
            return 'Close Entry';
        },
        isClosed() {
            let taskStatus = this.task.fields['Status'].value;
            return taskStatus === 'closed';
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
    watch: {
        task: 'descriptionHeightExeeded'
    },
    methods: {
        toggleExpandText() {
            this.expandText = !this.expandText;
        },
        toggleAddComment() {
            this.addComment = !this.addComment;
        },
        displayAt(at) {
            return moment.unix(parseInt(at)).format('DD.MM.YYYY - HH:mm');
        },
        getStateColour() {
            let taskStatus = this.task.fields['Status'].value;
            if(taskStatus === 'closed') {
                return 'primary';
            } else {
                return 'info';
            }
        },
        action(type) {
            switch (type) {
                case 'edit':
                    this.$store.dispatch("switchEditMode", true);
                    break;
                case 'saveComment': {
                    let request = {
                        id: this.task.id,
                        comment: this.newComment,
                    };
                    this.$store.dispatch('updateTask', {gridState: this.grid, request});
                    this.addComment = !this.addComment;
                    this.newComment = '';
                    break;
                }
                case 'saveCommentClose': {
                    this.action('saveComment');
                    this.action('updateStatus');
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
                    });
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
                    this.$store.dispatch('updateTask', {gridState: this.grid, request});
                    break;
                }
                default:
                    console.warn("Unknown action: " + type);
            }
        },
        descriptionHeightExeeded() {
            this.expandText = false;
            this.$nextTick(function() {
                let maxHeight = $(this.$refs.description).css('max-height').split('px')[0];
                let height = $(this.$refs.description).height();
                if(height == maxHeight){
                    this.showReadMore = true;
                } else {
                    this.showReadMore = false;
                }
            });
        }
    },
    mounted() {
        this.descriptionHeightExeeded();
    }
};
</script>

<style lang="sass">
.flatskin-wrapped {
    .panel hr {
        height: 1px;
        color: #F7F6F3;
        width: calc(100% +40px);
        margin-left: -20px;
        margin-right: -20px;
    }
}
.top-space{
    margin-top: 25px;
}
.scroll-container {
    overflow-y: auto;
    height: calc( 100vh - 9.5rem);
    padding: 0px 20px;
    .row .columns {
        padding: 0;
        &.title {
            padding: 5px 0;
            color: #7F7B71;
            font-size: 13px;
        }
        &.action {
            color: #52cae4;
            text-align: right;
            font-size: 0.9rem;
        }
    }
    .right {
        text-align: right;
    }
}
.top{
    padding: 5px 20px 0px 20px;
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
        min-width: 50px;
    }
    .actions {
        text-align: right;
    }
}
.expand-enter-active, .expand-leave-active {
    transition: all .1s ease;
}
.expand-enter, .expand-leave-to {
    opacity: 0;
    transform: scale(1,0);
}
.comment-header {
    margin-top: 15px;
    padding: 5px 20px;
    border-radius: 4px 4px 0px 0px;
    -moz-border-radius: 4px 4px 0px 0px;
    -webkit-border-radius: 4px 4px 0px 0px;
    border: 0px solid #000000;
    background-color: #E2E2E2;
    color: black;
    &.row  > .columns.title {
        margin-right: 5px;
        color: black;
        &.date {
            font-size: 11px;
            color: #84878A;
        }
    }
}
.comment-body {
    padding: 10px 20px;
    border-radius: 0px 0px 4px 4px;
    -moz-border-radius: 0px 0px 4px 4px;
    -webkit-border-radius: 0px 0px 4px 4px;
    border: 0px solid #000000;
    background-color: #F7F7F7;
    color: #282C2E;
}
.description {
    max-height: 250px;
    position: relative;
    overflow: hidden;
    margin-bottom: 20px;
    -webkit-transition: max-height 0.3s ease-in;
    transition: max-height 0.3s ease-in;
    .show-more {
        padding: 6px;
        height: 53px;
        position: absolute;
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
    &.all {
        .show-more {
            position: relative;
        }
        max-height: 9999px;
        overflow: overlay;
    }
}
h3.top-title {
    color: #52cae4;
    margin: 0;
}
.bottom-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    border-top: solid 1px lightgray;
    width: 100%;
    height: 3rem;
    justify-content: center;
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: flex-start;
    padding: 0 20px;
    .button {
        padding: 9px 11px 9px 9px;
        margin: 0.5rem 0.2rem;
    }
}
</style>
