<template>
    <div>
        <transition name="expand">
        <div v-show="addComment || comments.length == 0" class="newComment" style="transform-origin: 50% 0%;">
            <textarea v-model="newComment" :placeholder="maketext('new comment')"></textarea>
            <div class="right">
                <split-button v-on:action="action('saveComment')" :title="maketext('Save comment')">
                    <li v-on:click="action('saveCommentClose')">
                        {{maketext(!isClosed ? "Save and close entry" : "Save and reopen entry")}}
                    </li>
                </split-button>
            </div>
        </div>
        </transition>
        <template v-for="(comment, index) in comments">
            <template v-if="comment.loading">
                <div class="comment-header row align-middle" @mouseover="hover = 'comment'+index" @mouseleave="hover=''">
                    <div class="title date columns"></div>
                </div>
                <div class="comment comment-body row"><i class="fa fa-loading"></i></div>
            </template>
            <template v-else>
                <div class="comment-header row align-middle" @mouseover="hover = 'comment'+index" @mouseleave="hover=''">
                    <div class="title columns shrink">{{comment.user.wikiname}}</div>
                    <div class="title date columns">{{displayAt(comment.at)}}</div>
                    <div v-show="hover === 'comment'+index" class="title columns right"><i class="fa fa-pencil"></i></div>
                </div>
                <div class="comment comment-body row" v-html="comment.comment"></div>
            </template>
        </template>
        <p/>
    </div>
</template>

<script>
import TaskPanelMixin from "../../../mixins/TaskPanelMixin.vue";
import SplitButton from "./SplitButton.vue";

/* global moment swal */
export default {
    mixins: [TaskPanelMixin],
    props: ['addComment'],
    data() {
        return {
            newComment: '',
            hover: '',
            loadingComments: false
        };
    },
    components: {
        SplitButton
    },
    computed: {
        isClosed() {
            let taskStatus = this.task.fields['Status'].value;
            return taskStatus === 'closed';
        },
        comments() {
            if(this.task.changesets){
                let serverComments = this.task.changesets.filter(function (change) {
                    return change.comment ? true : false;
                }).reverse();
                if(this.loadingComments) {
                    return  [{loading: true},...serverComments];
                }
                return serverComments;
            }
            return {};
        },
    },
    methods: {
        toggleAddComment() {
            this.addComment = !this.addComment;
        },
        displayAt(at) {
            return moment.unix(parseInt(at)).format('DD.MM.YYYY - HH:mm');
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
                case 'saveComment': {
                    let request = {
                        id: this.task.id,
                        comment: this.newComment,
                    };
                    self = this;
                    let onSuccess = function(){
                        self.loadingComments = false;
                    };
                    this.$store.dispatch('updateComment', {gridState: this.grid, request, onLeaseTaken, onSuccess});
                    this.loadingComments = true;
                    this.$parent.addComment = !this.addComment;
                    this.newComment = '';
                    break;
                }
                case 'saveCommentClose': {
                    let newStatus = 'closed';
                    if (this.isClosed) {
                        newStatus = 'open';
                    }
                    let request = {
                        id: this.task.id,
                        Status: newStatus,
                        comment: this.newComment,
                    };
                    this.$store.dispatch('updateTask', {gridState: this.grid, request, onLeaseTaken});
                    this.$parent.addComment = !this.addComment;
                    this.newComment = '';
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
.comment-header {
    margin-top: 15px;
    padding: 5px 20px;
    border-radius: 4px 4px 0px 0px;
    -moz-border-radius: 4px 4px 0px 0px;
    -webkit-border-radius: 4px 4px 0px 0px;
    border: 0px solid #000000;
    background-color: #E2E2E2;
    color: black;
    min-height: 48px;
    &.row  > .columns.title {
        margin-right: 5px;
        padding: 0;
        color: black;
        i {
            color: #84878A;
        }
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
.newComment {
    margin-bottom: 30px;
}
</style>
